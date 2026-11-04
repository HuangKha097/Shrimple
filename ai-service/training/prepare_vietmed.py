"""Prepare a bounded VietMed development sample; never load the test split."""
import argparse
import hashlib
import io
import json
import math
from collections import defaultdict
from pathlib import Path

from accent_benchmark import balanced_plan, validate
from evidence import sha256, write_json

REVISION = "f302146de79c5cbd6a7d14400fefa2c8cfda7738"
ACCENT_MAP = {"North": "north", "South East": "south", "South West": "south",
              "Central Highland": "central_highlands"}


def identity(kind, value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Missing source identity")
    return "vietmed:" + kind + ":" + hashlib.sha256(value.encode()).hexdigest()[:24]


def accent(value):
    # Highlands are a separate reported category, never a guessed coastal Central label.
    return ACCENT_MAP.get(value, "unknown")


def metadata(row, split):
    return {"id": identity("utterance", row["utterance_id"]), "split": split,
            "speaker_id": identity("speaker", row["speaker_name"]),
            "source_recording_id": identity("recording", row["audio_name"]),
            "source_id": "leduckhai/VietMed", "source_revision": REVISION,
            "accent": accent(row["accent"]), "accent_original": row["accent"],
            "accent_source": "VietMed source metadata.accent; explicit versioned mapping",
            "duration_seconds": float(row["duration"]), "speed": "unknown",
            "accent_strength": "unknown", "age": "unknown", "domain": "medical"}


def profile(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["accent_original"]].append(row)
    return {key: {"samples": len(group), "speakers": len({r["speaker_id"] for r in group}),
                  "seconds": sum(r["duration_seconds"] for r in group)} for key, group in sorted(groups.items())}


def prepare(source, output, per_speaker=10, seed=42):
    import numpy as np
    import pyarrow.parquet as pq
    import soundfile as sf
    from scipy.signal import resample_poly

    if per_speaker < 1:
        raise ValueError("Positive per-speaker limit required")
    acquisition = json.loads((source / "acquisition.json").read_text(encoding="utf-8"))
    if acquisition["repo"] != "leduckhai/VietMed" or acquisition["revision"] != REVISION:
        raise ValueError("Unexpected source/revision")
    expected = {f["path"]: f["sha256"] for f in acquisition["files"]}
    tables, partitions = {}, {}
    for split, filename in (("train", "train"), ("validation", "dev")):
        relative = f"data/{filename}-00000-of-00001.parquet"
        path = source / relative
        if sha256(path) != expected.get(relative):
            raise ValueError("Source checksum mismatch")
        table = pq.read_table(path)
        tables[split] = table
        partitions[split] = [metadata(r, split) for r in table.drop(["audio", "text"]).to_pylist()]
    all_rows = partitions["train"] + partitions["validation"]
    if len({r["id"] for r in all_rows}) != len(all_rows):
        raise ValueError("Duplicate source utterance ID")
    for key in ("speaker_id", "source_recording_id"):
        if {r[key] for r in partitions["train"]} & {r[key] for r in partitions["validation"]}:
            raise ValueError("Source split identity leakage")
    # Fingerprint encoded train audio without decoding it; blocks byte-identical dev copies.
    training = [{**r, "encoded_audio_sha256": hashlib.sha256(tables["train"]["audio"][i].as_py()["bytes"]).hexdigest()}
                for i, r in enumerate(partitions["train"])]
    speakers = defaultdict(list)
    for index, row in enumerate(partitions["validation"]):
        speakers[row["speaker_id"]].append(index)
    selected = []
    for speaker in sorted(speakers):
        indices = sorted(speakers[speaker], key=lambda i: hashlib.sha256(
            f"{seed}:{partitions['validation'][i]['id']}".encode()).hexdigest())
        selected.extend(indices[:per_speaker])
    output.mkdir(parents=True, exist_ok=False)
    (output / "audio").mkdir()
    manifest = []
    for index in selected:
        original = tables["validation"].slice(index, 1).to_pylist()[0]
        row = partitions["validation"][index].copy()
        payload = original["audio"]["bytes"]
        signal, rate = sf.read(io.BytesIO(payload), dtype="float32", always_2d=True)
        signal = signal.mean(axis=1)
        if rate != 16000:
            divisor = math.gcd(rate, 16000)
            signal = resample_poly(signal, 16000 // divisor, rate // divisor)
        if not np.isfinite(signal).all() or not 0 < len(signal) <= 30 * 16000:
            raise ValueError("Invalid audio")
        relative = "audio/" + row["id"].split(":")[-1] + ".wav"
        sf.write(output / relative, signal, 16000, subtype="PCM_16")
        row.update(audio=relative, text=original["text"],
                   duration_seconds=len(signal) / 16000, audio_sha256=sha256(output / relative),
                   encoded_audio_sha256=hashlib.sha256(payload).hexdigest())
        manifest.append(row)
    audit = validate(manifest, training)
    (output / "benchmark.manifest.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in manifest), encoding="utf-8")
    write_json(output / "training-identities.private.json", training)
    write_json(output / "balanced-training-plan.json", balanced_plan(partitions["train"]))
    write_json(output / "profile.json", {"source": acquisition, "source_acquisition_sha256": sha256(source / "acquisition.json"),
        "source_train": profile(partitions["train"]), "source_validation": profile(partitions["validation"]),
        "selected_validation": profile(manifest), "selection": {"seed": seed, "up_to_clips_per_speaker": per_speaker,
        "method": "sha256(seed:source_utterance_id), equal cap per documented dev speaker; no reference/error selection"},
        "audit": audit, "test_read": False, "scope": "medical-domain development diagnostic; incomplete N-C-S coverage",
        "manifest_sha256": sha256(output / "benchmark.manifest.jsonl"),
        "script_sha256": sha256(Path(__file__))})
    print(json.dumps({"samples": len(manifest), "speakers": len(speakers), "test_read": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--per-speaker", type=int, default=10)
    args = parser.parse_args()
    prepare(args.source.resolve(), args.output.resolve(), args.per_speaker)
