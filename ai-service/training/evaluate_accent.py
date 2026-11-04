"""Frozen Whisper-base diagnostic on a private, speaker-disjoint validation manifest."""
import argparse
import csv
import json
import platform
import shutil
import time
import traceback
import wave
from pathlib import Path

from accent_benchmark import summarize, validate
from evidence import sha256, write_json

MODEL = "openai/whisper-base"
REVISION = "e37978b90ca9030d5170a5c07aadb050351a65bb"
GENERATION = {"task": "transcribe", "language": "vi", "do_sample": False,
              "num_beams": 1, "max_new_tokens": 225}


def generation_cap_hit(token_ids, eos_token_id, max_new_tokens):
    """Match finetune.py: account for prompt length without assuming four prefix IDs."""
    if not token_ids:
        raise ValueError("Empty generated token sequence")
    return len(token_ids) >= max_new_tokens and token_ids[-1] != eos_token_id


def evaluate(manifest, identities, protocol_path, output):
    import numpy as np
    import torch
    import transformers
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    rows = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    training_rows = json.loads(identities.read_text(encoding="utf-8"))
    audit = {**validate(rows, training_rows), "training_identity_rows_checked": len(training_rows)}
    input_hashes = {"manifest": sha256(manifest), "training_identities": sha256(identities), "protocol": sha256(protocol_path)}
    snapshot = output / "source-snapshot"
    snapshot.mkdir()
    for name in ("evaluate_accent.py", "accent_benchmark.py", "evidence.py", "benchmark.protocol.json"):
        shutil.copyfile(Path(__file__).with_name(name), snapshot / name)
    source_hash = sha256(snapshot / "evaluate_accent.py")
    if any(r["split"] != "validation" for r in rows):
        raise ValueError("Development validation only")
    torch.set_num_threads(2)
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = WhisperProcessor.from_pretrained(MODEL, revision=REVISION, local_files_only=True)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL, revision=REVISION,
                local_files_only=True, use_safetensors=True).to(device).eval()
    model.generation_config.forced_decoder_ids = None
    write_json(output / "environment.json", {"python": platform.python_version(), "torch": torch.__version__,
               "transformers": transformers.__version__, "device": device,
               "gpu": torch.cuda.get_device_name() if device == "cuda" else None})
    predictions = []
    started = time.perf_counter()
    with torch.inference_mode():
        for row in rows:
            path = (manifest.parent / row["audio"]).resolve()
            if not path.is_relative_to(manifest.parent.resolve()) or sha256(path) != row["audio_sha256"]:
                raise ValueError("Invalid audio path or changed audio")
            with wave.open(str(path), "rb") as audio:
                if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                    raise ValueError("Require mono PCM16 16kHz")
                if not 0 < audio.getnframes() <= 30 * 16000:
                    raise ValueError("Audio duration outside (0,30s]")
                signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
            features = processor.feature_extractor(signal, sampling_rate=16000,
                         return_attention_mask=True, return_tensors="pt").to(device)
            tokens = model.generate(**features, **GENERATION)
            predictions.append({"id": row["id"], "reference": row["text"],
                "hypothesis": processor.batch_decode(tokens, skip_special_tokens=True)[0],
                "ended_with_eos": tokens[0, -1].item() == model.generation_config.eos_token_id,
                "generation_cap_reached": generation_cap_hit(tokens[0].tolist(), model.generation_config.eos_token_id,
                                                             GENERATION["max_new_tokens"])})
            if len(predictions) % 20 == 0 or len(predictions) == len(rows):
                write_json(output / "predictions.private.json", predictions)
                print(f"baseline {len(predictions)}/{len(rows)}", flush=True)
    if input_hashes != {"manifest": sha256(manifest), "training_identities": sha256(identities), "protocol": sha256(protocol_path)}:
        raise ValueError("Evaluation inputs changed during inference")
    result = summarize(rows, predictions, protocol)
    result.update(model_id=MODEL, model_revision=REVISION, generation=GENERATION,
        inference_seconds=time.perf_counter() - started, audit=audit,
        manifest_sha256=sha256(manifest), training_identities_sha256=sha256(identities),
        protocol_sha256=sha256(protocol_path), source_script_sha256=source_hash,
        domain=sorted({r.get("domain", "unknown") for r in rows}),
        scope="Source-labelled development sample; HF fp32, not GGML serving, not full accent benchmark",
        generation_cap_flags=sum(p["generation_cap_reached"] for p in predictions))
    write_json(output / "summary.json", result)
    with (output / "groups.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["group", "samples", "speakers", "seconds", "wer_percent", "cer_percent", "status"])
        for label, group in result["groups"].items():
            metrics = group["metrics"] or {}
            writer.writerow([label, group["samples"], group["speakers"], group.get("seconds", ""),
                             metrics.get("wer_percent", ""), metrics.get("cer_percent", ""), group["status"]])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--training-identities", required=True, type=Path)
    parser.add_argument("--protocol", type=Path, default=Path(__file__).with_name("benchmark.protocol.json"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    write_json(args.output / "status.json", {"status": "running", "purpose": "accent_development_diagnostic"})
    try:
        evaluate(args.manifest.resolve(), args.training_identities.resolve(), args.protocol, args.output)
        write_json(args.output / "status.json", {"status": "completed", "purpose": "accent_development_diagnostic"})
    except BaseException as exc:
        (args.output / "error.private.txt").write_text(traceback.format_exc(), encoding="utf-8")
        write_json(args.output / "status.json", {"status": "failed", "error_type": type(exc).__name__})
        raise SystemExit(f"Diagnostic failed: {type(exc).__name__}; inspect private evidence")
    finally:
        write_json(args.output / "artifacts-sha256.json", {p.name: sha256(p) for p in args.output.iterdir()
                   if p.is_file() and p.name != "artifacts-sha256.json"})
