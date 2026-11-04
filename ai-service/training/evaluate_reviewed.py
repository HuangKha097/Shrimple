"""Compare a trained run with its base on reviewed, out-of-training diagnostics.

This does not turn the diagnostic recording into an independent multi-speaker test.
"""
import argparse
import csv
import gc
import json
import time
import traceback
import wave
from pathlib import Path

from evidence import score, sha256, write_json


def evaluate(run, csv_path, output):
    import numpy as np
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    if not torch.cuda.is_available():
        raise ValueError("CUDA required for this diagnostic comparison")
    state = json.loads((run / "status.json").read_text(encoding="utf-8"))
    if state["status"] != "experiment_completed" or state["purpose"] != "research":
        raise ValueError("Require a completed research run")
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows or any(r.get("review_status") != "reviewed" or not r.get("text", "").strip() for r in rows):
        raise ValueError("Require reviewed non-empty references")
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Duplicate diagnostic IDs")
    training = json.loads((run / "dataset-snapshot.private.json").read_text(encoding="utf-8"))
    trained_speakers = {r["speaker_id"] for r in training if r["split"] == "train"}
    trained_hashes = {r["audio_sha256"] for r in training if r["split"] == "train"}
    for row in rows:
        row["audio_sha256"] = sha256(csv_path.parent / row["audio"])
        if row["speaker_id"] in trained_speakers or row["audio_sha256"] in trained_hashes:
            raise ValueError("Diagnostic overlaps training speaker/audio")
    source = json.loads((run / "model-source.json").read_text(encoding="utf-8"))
    generation = json.loads((run / "generation.json").read_text(encoding="utf-8"))
    torch.set_num_threads(2)
    results = {}
    for label in ("baseline", "tuned"):
        checkpoint = source["model_id"] if label == "baseline" else str(run / "merged")
        options = {"revision": source["resolved_revision"]} if label == "baseline" else {}
        processor = WhisperProcessor.from_pretrained(checkpoint, local_files_only=True, **options)
        model = WhisperForConditionalGeneration.from_pretrained(checkpoint, local_files_only=True,
                   use_safetensors=True, **options).to("cuda").eval()
        model.generation_config.forced_decoder_ids = None
        predictions = []
        with torch.inference_mode():
            for row in rows:
                path = csv_path.parent / row["audio"]
                if sha256(path) != row["audio_sha256"]:
                    raise ValueError("Audio changed during evaluation")
                with wave.open(str(path), "rb") as audio:
                    if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                        raise ValueError("Require monoPCM16/16k WAV")
                    if not 0 < audio.getnframes() <= 30 * 16000:
                        raise ValueError("Audio duration outside (0,30s]")
                    signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
                features = processor.feature_extractor(signal, sampling_rate=16000,
                              return_attention_mask=True, return_tensors="pt").to("cuda")
                torch.cuda.synchronize()
                started = time.perf_counter()
                tokens = model.generate(**features, language=row["language"], **generation)
                torch.cuda.synchronize()
                predictions.append({"id": row["id"], "reference": row["text"],
                    "hypothesis": processor.batch_decode(tokens, skip_special_tokens=True)[0],
                    "inference_seconds": time.perf_counter() - started,
                    "audio_sha256": row["audio_sha256"]})
                print(f"{label}: {len(predictions)}/{len(rows)}", flush=True)
        results[label] = score([(p["reference"], p["hypothesis"]) for p in predictions])
        write_json(output / f"{label}-predictions.private.json", predictions)
        del model, processor, features, tokens
        gc.collect()
        torch.cuda.empty_cache()
    summary = {"scope": "Single user recording, diagnostic only; not multi-speaker test, HF fp32 not serving GGML",
        "training_run": run.name, "reviewed_csv_sha256": sha256(csv_path),
        "model_revision": source["resolved_revision"], "samples": len(rows),
        "baseline": results["baseline"], "tuned": results["tuned"],
        "wer_change_percentage_points": results["tuned"]["wer_percent"] - results["baseline"]["wer_percent"],
        "source_script_sha256": sha256(Path(__file__)), "generation": generation}
    write_json(output / "summary.json", summary)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / "status.json", {"status": "running", "scope": "diagnostic_only"})
    try:
        evaluate(args.run.resolve(), args.csv.resolve(), output)
        write_json(output / "status.json", {"status": "completed", "scope": "diagnostic_only"})
    except BaseException as exc:
        (output / "error.private.txt").write_text(traceback.format_exc(), encoding="utf-8")
        write_json(output / "status.json", {"status": "failed", "error_type": type(exc).__name__})
        raise SystemExit(f"Diagnostic failed: {type(exc).__name__}; inspect private evidence")
    finally:
        write_json(output / "artifacts-sha256.json", {p.name: sha256(p) for p in output.iterdir()
                   if p.is_file() and p.name != "artifacts-sha256.json"})
