"""Compare frozen PhoWhisper-base and Whisper-base on local validation audio only.

Private predictions remain under ignored runs/. This is an ASR diagnostic, not
translation or call acceptance. No training, test-set reading, or label edits.
"""
import argparse
import gc
import json
import os
import platform
import time
import wave
from pathlib import Path

from evidence import sha256, score, write_json

PHO_REVISION = "7ebdb9e88f5cc5271fb88f4d642c82ff9388650e"
BASE_REVISION = "e37978b90ca9030d5170a5c07aadb050351a65bb"


def evaluate(manifest, output, pho_model, language):
    os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parents[2] / ".cache/huggingface"))
    import numpy as np
    import torch
    import transformers
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    rows = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    rows = [row for row in rows if row["split"] == "validation"]
    if not rows or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Require nonempty, unique validation rows")
    digest = sha256(manifest)
    for row in rows:
        audio = (manifest.parent / row["audio"]).resolve()
        if not audio.is_relative_to(manifest.parent) or sha256(audio) != row["audio_sha256"]:
            raise ValueError("Unsafe or changed audio")
    torch.set_num_threads(2)
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    generation = dict(task="transcribe", language=language, do_sample=False,
                      num_beams=1, max_new_tokens=225)
    result = dict(status="running", manifest_sha256=digest, samples=len(rows), language=language,
                  python=platform.python_version(), torch=torch.__version__,
                  transformers=transformers.__version__, device=device, generation=generation,
                  scope="HF fp32 validation diagnostic; unknown overlap with upstream pretraining; not live call acceptance",
                  models={})
    for name, location, revision in (("whisper-base", "openai/whisper-base", BASE_REVISION),
                                     ("phowhisper-base", str(pho_model), PHO_REVISION)):
        processor = WhisperProcessor.from_pretrained(location, revision=revision, local_files_only=True)
        model = WhisperForConditionalGeneration.from_pretrained(location, revision=revision,
                     local_files_only=True).to(device).eval()
        model.generation_config.forced_decoder_ids = None
        predictions = []
        started = time.perf_counter()
        with torch.inference_mode():
            for row in rows:
                with wave.open(str(manifest.parent / row["audio"]), "rb") as audio:
                    if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                        raise ValueError("Require mono PCM16 16kHz")
                    if not 0 < audio.getnframes() <= 30 * 16000:
                        raise ValueError("Audio must be in (0,30s]")
                    signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
                features = processor.feature_extractor(signal, sampling_rate=16000,
                             return_attention_mask=True, return_tensors="pt").to(device)
                tokens = model.generate(**features, **generation)
                predictions.append(dict(id=row["id"], reference=row["text"],
                    hypothesis=processor.batch_decode(tokens, skip_special_tokens=True)[0],
                    accent=row.get("accent", "unknown"),
                    cap_reached=len(tokens[0]) >= 225 and tokens[0, -1].item() != model.generation_config.eos_token_id))
                if len(predictions) % 10 == 0 or len(predictions) == len(rows):
                    write_json(output / f"{name}.predictions.private.json", predictions)
                    print(f"{name}: {len(predictions)}/{len(rows)}", flush=True)
        metrics = lambda data: score([(p["reference"], p["hypothesis"]) for p in data])
        result["models"][name] = dict(revision=revision, metrics=metrics(predictions),
            inference_seconds=time.perf_counter() - started,
            cap_flags=sum(p["cap_reached"] for p in predictions),
            groups={a: metrics([p for p in predictions if p["accent"] == a])
                    for a in sorted({p["accent"] for p in predictions})})
        write_json(output / "summary.json", result)
        del model, processor
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    if sha256(manifest) != digest:
        raise ValueError("Manifest changed during trial")
    result["status"] = "completed"
    write_json(output / "summary.json", result)
    print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--pho-model", type=Path, default=Path(__file__).parent / "runs/phowhisper-base-trial/model")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--language", choices=("en", "vi"), default="vi")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    evaluate(args.manifest.resolve(), args.output, args.pho_model.resolve(), args.language)
