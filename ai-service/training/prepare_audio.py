"""Prepare local audio for HUMAN annotation; never invent training labels."""
import argparse
import csv
import json
import math
from pathlib import Path

from evidence import sha256, write_json


def prepare(source, output, chunk_seconds=20):
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly

    source, output = Path(source).resolve(), Path(output).resolve()
    if not 1 <= chunk_seconds <= 30:
        raise ValueError("Chunk duration must be between 1 and 30 seconds")
    # Refuse overwrites: corrections and prior evidence must survive reruns.
    output.mkdir(parents=True, exist_ok=False)
    audio, rate = sf.read(source, dtype="float32", always_2d=True)
    if len(audio) == 0 or not np.isfinite(audio).all():
        raise ValueError("Empty/non-finite audio")
    mono = audio.mean(axis=1)
    divisor = math.gcd(rate, 16000)
    mono = resample_poly(mono, 16000 // divisor, rate // divisor)
    rows = []
    chunk_frames = round(chunk_seconds * 16000)
    for index, start in enumerate(range(0, len(mono), chunk_frames)):
        clip = mono[start:start + chunk_frames]
        name = f"clip-{index:04d}.wav"
        sf.write(output / name, np.clip(clip, -1, 1), 16000, subtype="PCM_16")
        rows.append({"id": f"clip-{index:04d}", "audio": name,
                     "start_seconds": start / 16000, "end_seconds": (start + len(clip)) / 16000,
                     "text": "", "speaker_id": "", "split": "", "language": "",
                     "source": "", "permission": ""})
    with (output / "annotations.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    write_json(output / "preparation.json", {
        "status": "awaiting_human_transcript_speaker_split_and_permission",
        "source_name": source.name, "source_sha256": sha256(source),
        "source_sample_rate": rate, "source_channels": audio.shape[1],
        "source_duration_seconds": len(audio) / rate,
        "output_sample_rate": 16000, "chunk_seconds": chunk_seconds,
        "chunks": len(rows), "output_sha256": {r["audio"]: sha256(output / r["audio"]) for r in rows},
        "tool_versions": {"numpy": np.__version__, "soundfile": sf.__version__,
                          "libsndfile": sf.__libsndfile_version__,
                          "scipy": __import__("scipy").__version__},
        "limitations": "Fixed windows may cut sentences or contain silence/multiple speakers; review and trim before labeling. No labels generated; not a training/test dataset yet."})
    return len(rows)


def manifest_from_csv(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source.parent != output.parent:
        raise ValueError("Keep manifest beside annotations so relative audio paths remain valid")
    required = ("id", "audio", "text", "speaker_id", "split", "language", "source", "permission")
    with source.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows or any(not (r.get(k) or "").strip() for r in rows for k in required):
        raise ValueError("Human annotation is incomplete; fill all required fields")
    if any("review_status" in r and r["review_status"] != "reviewed" for r in rows):
        raise ValueError("Draft rows must be explicitly marked reviewed")
    with output.open("x", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps({k: row[k] for k in required}, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    audio = commands.add_parser("audio")
    audio.add_argument("source", type=Path)
    audio.add_argument("output", type=Path)
    audio.add_argument("--chunk-seconds", type=float, default=20)
    manifest = commands.add_parser("manifest")
    manifest.add_argument("source", type=Path)
    manifest.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "audio":
        print(f"Prepared {prepare(args.source, args.output, args.chunk_seconds)} unlabelled chunks")
    else:
        manifest_from_csv(args.source, args.output)
        print("Manifest written; run finetune.py audit before training")
