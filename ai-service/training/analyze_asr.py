"""Analyze train/validation only, including genuine in-sample train decoding."""
import argparse
import csv
import gc
import json
import time
import unicodedata
import wave
from collections import Counter, defaultdict
from pathlib import Path

from evidence import normalize, score, sha256, write_json


def edits(reference, hypothesis):
    """Deterministic minimum-edit alignment: substitution, deletion, insertion ties."""
    ref, hyp = normalize(reference).split(), normalize(hypothesis).split()
    costs = [[0] * (len(hyp) + 1) for _ in range(len(ref) + 1)]
    for i in range(len(ref) + 1):
        costs[i][0] = i
    for j in range(len(hyp) + 1):
        costs[0][j] = j
    for i, left in enumerate(ref, 1):
        for j, right in enumerate(hyp, 1):
            costs[i][j] = min(costs[i-1][j] + 1, costs[i][j-1] + 1,
                              costs[i-1][j-1] + (left != right))
    i, j, result = len(ref), len(hyp), []
    while i or j:
        if i and j and ref[i-1] == hyp[j-1] and costs[i][j] == costs[i-1][j-1]:
            i, j = i-1, j-1
        elif i and j and costs[i][j] == costs[i-1][j-1] + 1:
            result.append(("substitution", ref[i-1], hyp[j-1])); i, j = i-1, j-1
        elif i and costs[i][j] == costs[i-1][j] + 1:
            result.append(("deletion", ref[i-1], "")); i -= 1
        else:
            result.append(("insertion", "", hyp[j-1])); j -= 1
    return list(reversed(result))


def unaccent(value):
    return "".join(c for c in unicodedata.normalize("NFD", value.replace("đ", "d"))
                   if unicodedata.category(c) != "Mn")


def aggregate(rows):
    operations = Counter()
    mark_only = 0
    for row in rows:
        ops = edits(row["reference"], row["hypothesis"])
        operations.update(op for op, _, _ in ops)
        mark_only += sum(op == "substitution" and unaccent(a) == unaccent(b) for op, a, b in ops)
    metrics = score([(r["reference"], r["hypothesis"]) for r in rows])
    assert sum(operations.values()) == metrics["word_errors"]
    return {**metrics, "samples": len(rows), "operations": dict(operations),
            "substitutions_differing_only_in_diacritics": mark_only}


def analyze(run, output):
    import numpy as np
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    output.mkdir(parents=True, exist_ok=False)
    write_json(output / "status.json", {"status": "running", "scope": "train_validation_only"})
    records = [r for r in json.loads((run / "dataset-snapshot.private.json").read_text(encoding="utf-8"))
               if r["split"] in ("train", "validation")]
    source = json.loads((run / "model-source.json").read_text(encoding="utf-8"))
    generation = json.loads((run / "generation.json").read_text(encoding="utf-8"))
    torch.set_num_threads(2)
    decoded = {}
    for label in ("baseline", "tuned"):
        checkpoint = source["model_id"] if label == "baseline" else str(run / "merged")
        options = {"revision": source["resolved_revision"]} if label == "baseline" else {}
        processor = WhisperProcessor.from_pretrained(checkpoint, local_files_only=True, **options)
        model = WhisperForConditionalGeneration.from_pretrained(checkpoint, local_files_only=True,
                    use_safetensors=True, **options).to("cuda").eval()
        model.generation_config.forced_decoder_ids = None
        predictions = json.loads((run / f"{label}-validation-predictions.private.json").read_text(encoding="utf-8"))
        expected = {r["id"]: r["text"] for r in records if r["split"] == "validation"}
        if {p["id"]: p["reference"] for p in predictions} != expected:
            raise ValueError("Cached validation predictions do not match references")
        predictions = {p["id"]: p for p in predictions}
        with torch.inference_mode():
            for index, row in enumerate([r for r in records if r["split"] == "train"]):
                if sha256(row["audio"]) != row["audio_sha256"]:
                    raise ValueError("Audited audio changed")
                with wave.open(row["audio"], "rb") as audio:
                    signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
                inputs = processor.feature_extractor(signal, sampling_rate=16000, return_tensors="pt",
                                                       return_attention_mask=True).to("cuda")
                tokens = model.generate(**inputs, language=row["language"], **generation)
                predictions[row["id"]] = {"id": row["id"], "reference": row["text"],
                    "hypothesis": processor.batch_decode(tokens, skip_special_tokens=True)[0],
                    "ended_with_eos": tokens[0, -1].item() == model.generation_config.eos_token_id}
                if (index + 1) % 40 == 0:
                    print(f"{label} train: {index + 1}/160", flush=True)
        decoded[label] = predictions
        write_json(output / f"{label}-train-validation.private.json", list(predictions.values()))
        del model
        gc.collect()
        torch.cuda.empty_cache()

    metadata, label_tokens = {}, defaultdict(list)
    processor.tokenizer.set_prefix_tokens(language="vi", task="transcribe")
    prefix_ok = True
    for row in records:
        with wave.open(row["audio"], "rb") as audio:
            signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
        key = row["id"]
        raw_ids = processor.tokenizer(row["text"], add_special_tokens=False).input_ids
        lower_ids = processor.tokenizer(row["text"].lower(), add_special_tokens=False).input_ids
        prefix = processor.tokenizer.get_decoder_prompt_ids(language="vi", task="transcribe")
        manual = [token for _, token in prefix] + raw_ids + [processor.tokenizer.eos_token_id]
        official = processor.tokenizer(row["text"]).input_ids[1:]
        prefix_ok &= manual == official
        label_tokens[row["split"]].append((len(raw_ids), len(lower_ids)))
        metadata[key] = {"speaker": row["speaker_id"], "duration": row["duration_seconds"],
            "rms": float(np.sqrt(np.mean(signal ** 2))),
            "peak": float(np.abs(signal).max()), "clipped_fraction": float(np.mean(np.abs(signal) >= 32760/32768)),
            "uppercase": row["text"].isupper(), "label_tokens": len(manual)}
    summary = {"run_id": run.name, "scope": "train_validation_only; no test predictions opened",
        "model_revision": source["resolved_revision"], "prefix_matches_official_tokenizer": bool(prefix_ok),
        "source_sha256": sha256(Path(__file__)), "splits": {},
        "metric_note": "Diacritic-only means Unicode mark difference, not a verified phonetic cause; numbers are not rewritten; metrics unchanged"}
    cases = []
    for split in ("train", "validation"):
        split_rows = [r for r in records if r["split"] == split]
        selected = {label: [decoded[label][r["id"]] for r in split_rows] for label in decoded}
        by_speaker = {}
        for speaker in sorted({r["speaker_id"] for r in split_rows}):
            ids = {r["id"] for r in split_rows if r["speaker_id"] == speaker}
            by_speaker[speaker] = {label: aggregate([p for p in selected[label] if p["id"] in ids]) for label in decoded}
        quality = [metadata[r["id"]] for r in split_rows]
        changes = Counter()
        for row in split_rows:
            before, after = (decoded[label][row["id"]] for label in ("baseline", "tuned"))
            delta = score([(after["reference"], after["hypothesis"])])["word_errors"] - score([(before["reference"], before["hypothesis"])])["word_errors"]
            changes["worse" if delta > 0 else "better" if delta < 0 else "same"] += 1
            cases.append({"id": row["id"], "split": split, "speaker_id": row["speaker_id"],
                          "reference": row["text"], "baseline": before["hypothesis"],
                          "tuned": after["hypothesis"], "word_error_change": delta,
                          "audio": row["audio"]})
        summary["splits"][split] = {label: aggregate(selected[label]) for label in decoded}
        summary["splits"][split].update(by_speaker=by_speaker, utterance_changes=dict(changes),
            quality={"uppercase_references": sum(q["uppercase"] for q in quality),
                     "zero_rms": sum(q["rms"] == 0 for q in quality),
                     "rms_below_0_001": sum(q["rms"] < .001 for q in quality),
                     "files_with_clipped_samples": sum(q["clipped_fraction"] > 0 for q in quality),
                     "max_clipped_fraction": max(q["clipped_fraction"] for q in quality),
                     "max_label_tokens": max(q["label_tokens"] for q in quality),
                     "original_text_tokens": sum(x[0] for x in label_tokens[split]),
                     "lowercase_text_tokens": sum(x[1] for x in label_tokens[split])})
    write_json(output / "cases.private.json", sorted(cases, key=lambda r: r["word_error_change"], reverse=True))
    write_json(output / "audio-quality.private.json", metadata)
    write_json(output / "summary.json", summary)
    write_json(output / "status.json", {"status": "completed", "scope": "train_validation_only"})
    write_json(output / "artifacts-sha256.json", {p.name: sha256(p) for p in output.iterdir() if p.is_file()})
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    analyze(args.run.resolve(), args.output.resolve())
