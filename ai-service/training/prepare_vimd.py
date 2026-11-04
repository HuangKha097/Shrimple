"""Bounded, pinned ViMD validation diagnostic; no train/test audio or public derivatives."""
import argparse
import hashlib
import io
import json
import math
from collections import defaultdict
from pathlib import Path

from accent_benchmark import validate
from evidence import sha256, write_json

REVISION = "3a5b30157034e7eadd5c75fae1a820c6f9383398"
REPO = "nguyendv02/ViMD_Dataset"


def stable(kind, value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Missing identity")
    return "vimd:" + kind + ":" + hashlib.sha256(value.encode()).hexdigest()[:24]


def audio_duration(payload):
    import soundfile as sf
    return sf.info(io.BytesIO(payload)).duration


def prepare(snapshot, output, download=False, per_region=30, source_cache=None):
    import numpy as np
    import pyarrow.parquet as pq
    import soundfile as sf
    from scipy.signal import resample_poly

    if per_region <= 0:
        raise ValueError("Positive sample cap required")
    meta = json.loads(snapshot.read_text(encoding="utf-8"))
    if meta["revision"] != REVISION or meta["gated"] is not False:
        raise ValueError("Require pinned ungated publisher metadata")
    # Region-only HTTP Range probes identified these shards; not random provinces.
    paths = [f"data/valid-{i:05d}-of-00013.parquet" for i in (0, 4, 6)]
    sizes = {f["path"]: f["bytes"] for f in meta["files"]}
    if sum(sizes[p] for p in paths) > 1_600_000_000:
        raise ValueError("Download budget exceeded")
    output.mkdir(parents=True, exist_ok=False)
    (output / "source").mkdir()
    (output / "audio").mkdir()
    acquisition = {"repo": REPO, "revision": REVISION, "split": "valid", "files": [],
        "use": "private non-commercial evaluation; original source retained; no trained model or audio/transcript redistribution",
        "license_declared": "CC-BY-NC-ND-4.0", "license_url": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
        "source_metadata_sha256": sha256(snapshot), "test_read": False, "train_read": False}
    candidates, table_paths = defaultdict(list), {}
    cached_files = {}
    if source_cache is not None:
        cache_meta = json.loads((source_cache.parent / "acquisition.json").read_text(encoding="utf-8"))
        if cache_meta["repo"] != REPO or cache_meta["revision"] != REVISION:
            raise ValueError("Wrong cache revision")
        cached_files = {r["path"]: r for r in cache_meta["files"]}
    for relative in paths:
        path = output / "source" / Path(relative).name
        cache_entry = cached_files.get(relative)
        cached = Path(cache_entry.get("local_path", str(source_cache / Path(relative).name))) if cache_entry else None
        if cached is not None:
            if sha256(cached) != cache_entry["sha256"]:
                raise ValueError("Cache checksum mismatch")
            path = cached
            received = path.stat().st_size
        else:
            if not download:
                raise ValueError("Explicit --download required for this bounded public-source acquisition")
            import requests
            # No login, account token, gating acceptance, or executable dataset scripts.
            url = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/{relative}"
            with requests.get(url, stream=True, timeout=(20, 45)) as response:
                response.raise_for_status()
                received = 0
                with path.open("xb") as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        received += len(chunk)
                        if received > sizes[relative]:
                            raise ValueError("Remote file larger than pinned metadata")
                        stream.write(chunk)
        if path.stat().st_size != sizes[relative]:
            raise ValueError("Incomplete download")
        acquisition["files"].append({"path": relative, "bytes": received, "sha256": sha256(path), "local_path": str(path.resolve())})
        write_json(output / "acquisition.json", acquisition)
        table_paths[path.name] = path
        table = pq.read_table(path)
        for index, row in enumerate(table.drop(["audio"]).to_pylist()):
            region = {"North": "north", "Central": "central", "South": "south"}.get(row["region"])
            # The published Parquet schema has no length field: read the audio header.
            duration = audio_duration(table["audio"][index].as_py()["bytes"])
            if region and 0 < duration <= 30:
                candidates[region].append((path.name, index, row))
        print(f"Acquired {Path(relative).name}: {received} bytes", flush=True)
        del table
    selected = []
    for region in ("north", "central", "south"):
        people = defaultdict(list)
        for candidate in candidates[region]:
            people[candidate[2]["speakerID"]].append(candidate)
        for speaker in people:
            people[speaker].sort(key=lambda c: hashlib.sha256(("42:" + c[2]["filename"]).encode()).hexdigest())
        ordered = sorted(people, key=lambda s: hashlib.sha256(("42:" + s).encode()).hexdigest())
        chosen = []
        while len(chosen) < per_region:
            progress = False
            for speaker in ordered:
                if people[speaker] and len(chosen) < per_region:
                    chosen.append(people[speaker].pop())
                    progress = True
            if not progress:
                break
        if not chosen:
            raise ValueError(f"No usable {region} samples in bounded shards")
        selected.extend((region, *c) for c in chosen)
    by_file = defaultdict(list)
    for entry in selected:
        by_file[entry[1]].append(entry)
    rows = []
    for filename, entries in by_file.items():
        table = pq.read_table(table_paths[filename])
        for region, _, index, meta_row in entries:
            raw = table.slice(index, 1).to_pylist()[0]
            payload = raw["audio"]["bytes"]
            signal, rate = sf.read(io.BytesIO(payload), dtype="float32", always_2d=True)
            signal = signal.mean(axis=1)
            if rate != 16000:
                divisor = math.gcd(rate, 16000)
                signal = resample_poly(signal, 16000 // divisor, rate // divisor)
            if not np.isfinite(signal).all() or not 0 < len(signal) <= 30 * 16000:
                raise ValueError("Selected audio outside validated duration")
            sample_id = stable("utterance", raw["filename"])
            relative = "audio/" + sample_id.split(":")[-1] + ".wav"
            sf.write(output / relative, signal, 16000, subtype="PCM_16")
            rows.append({"id": sample_id, "split": "validation", "audio": relative,
                "audio_sha256": sha256(output / relative), "encoded_audio_sha256": hashlib.sha256(payload).hexdigest(),
                "text": raw["text"], "speaker_id": stable("speaker", raw["speakerID"]),
                "source_recording_id": stable("utterance_recording", raw["filename"]),
                "recording_id_granularity": "utterance_only; upstream broadcast episode identity unavailable",
                "source_id": REPO, "source_revision": REVISION, "accent": region,
                "accent_source": "ViMD region metadata; not re-annotated by project",
                "province": raw["province_name"], "domain": "broadcast_news", "speed": "unknown",
                "accent_strength": "unknown", "age": "unknown", "duration_seconds": len(signal) / 16000})
        del table
    audit = validate(rows)
    (output / "benchmark.manifest.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    # No project training on this corpus. Empty list is not a claim of auditing the full official train IDs.
    write_json(output / "training-identities.private.json", [])
    profile = {}
    for region in ("north", "central", "south"):
        group = [r for r in rows if r["accent"] == region]
        profile[region] = {"samples": len(group), "speakers": len({r["speaker_id"] for r in group}),
            "seconds": sum(r["duration_seconds"] for r in group), "provinces": sorted({r["province"] for r in group})}
    write_json(output / "profile.json", {"source": acquisition, "selected_validation": profile, "audit": audit,
        "manifest_sha256": sha256(output / "benchmark.manifest.jsonl"), "script_sha256": sha256(Path(__file__)),
        "selection": "fixed valid shards 0/4/6 after region metadata probe; duration<=30s, seed42 speaker round-robin cap per region",
        "limitations": ["Limited provinces; not representative of 63 release dialect labels", "No independent full official-train speaker audit",
                         "Recording ID only identifies utterance; broadcast-episode overlap not established", "Whisper pretraining overlap unknown"]})
    print(json.dumps({"samples": len(rows), "groups": profile, "test_read": False}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--per-region", type=int, default=30)
    parser.add_argument("--source-cache", type=Path)
    args = parser.parse_args()
    prepare(args.metadata, args.output.resolve(), args.download, args.per_region, args.source_cache)
