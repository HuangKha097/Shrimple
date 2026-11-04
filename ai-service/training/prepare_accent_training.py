"""Separate official ViMD train, balanced by region, with VIVOS replay and frozen validation."""
import argparse
import hashlib
import io
import json
import math
import os
from collections import Counter, defaultdict
from pathlib import Path

from evidence import audit, normalize, sha256, write_json
from prepare_vimd import REPO, REVISION, stable

MODEL_REVISION = "e37978b90ca9030d5170a5c07aadb050351a65bb"


def round_robin(rows, seconds, speaker_cap, seed=42):
    if seconds <= 0 or speaker_cap <= 0:
        raise ValueError("Positive sampling budgets required")
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Duplicate sampling IDs")
    people = defaultdict(list)
    for row in rows:
        if not math.isfinite(row["duration_seconds"]) or row["duration_seconds"] <= 0:
            raise ValueError("Invalid candidate duration")
        people[row["speaker_id"]].append(row)
    for person, candidates in people.items():
        candidates.sort(key=lambda r: hashlib.sha256(f"{seed}:{r['id']}".encode()).hexdigest())
    order = sorted(people, key=lambda p: hashlib.sha256(f"{seed}:{p}".encode()).hexdigest())
    selected, used, total = [], defaultdict(float), 0
    while True:
        progress = False
        for person in order:
            while people[person]:
                row = people[person].pop()
                duration = row["duration_seconds"]
                if used[person] + duration <= speaker_cap and total + duration <= seconds:
                    selected.append(row); used[person] += duration; total += duration
                    progress = True
                    break
        if not progress:
            break
    return selected


def prepare(source, benchmark, vivos_manifest, output):
    import numpy as np
    import pyarrow.parquet as pq
    import soundfile as sf
    from scipy.signal import resample_poly
    from transformers import WhisperProcessor

    acquisition = json.loads((source / "acquisition.json").read_text(encoding="utf-8"))
    if acquisition["repo"] != REPO or acquisition["revision"] != REVISION or acquisition["split"] != "train":
        raise ValueError("Require pinned official train source")
    heldout = [json.loads(l) for l in benchmark.read_text(encoding="utf-8").splitlines() if l.strip()]
    if len(heldout) != 90 or any(r["split"] != "validation" for r in heldout):
        raise ValueError("Require frozen 90-item regional validation")
    held_speakers = {r["speaker_id"] for r in heldout}
    held_ids = {r["id"] for r in heldout}
    held_encoded = {r["encoded_audio_sha256"] for r in heldout}
    processor = WhisperProcessor.from_pretrained("openai/whisper-base", revision=MODEL_REVISION, local_files_only=True)
    output.mkdir(parents=True, exist_ok=False)
    (output / "audio").mkdir()
    candidates, rejected, seen_ids, seen_pcm = [], Counter(), set(), set()
    overlap = Counter()
    for file in acquisition["files"]:
        path = source / file["local_name"]
        if sha256(path) != file["sha256"]:
            raise ValueError("Source checksum mismatch")
        table = pq.read_table(path)
        metadata = table.drop(["audio"]).to_pylist()
        for index, raw in enumerate(metadata):
            row_id = stable("utterance", raw["filename"])
            person = stable("speaker", raw["speakerID"])
            region = {"North": "north", "Central": "central", "South": "south"}.get(raw["region"])
            if row_id in seen_ids:
                raise ValueError("Repeated official train utterance")
            seen_ids.add(row_id)
            if person in held_speakers or row_id in held_ids:
                overlap["speaker_or_utterance_excluded"] += 1
                continue
            text = raw["text"]
            if not region or not normalize(text):
                rejected["missing_region_or_text"] += 1; continue
            if "..." in text or "…" in text:
                rejected["ellipsis_in_source_reference"] += 1; continue
            token_count = len(processor.tokenizer(text.lower(), add_special_tokens=False).input_ids) + 4
            if token_count > 225:
                rejected["label_exceeds_225_tokens"] += 1; continue
            payload = table["audio"][index].as_py()["bytes"]
            encoded = hashlib.sha256(payload).hexdigest()
            if encoded in held_encoded:
                overlap["encoded_audio_excluded"] += 1; continue
            info = sf.info(io.BytesIO(payload))
            if not 1 <= info.duration <= 25:
                rejected["duration_outside_1_to_25_seconds"] += 1; continue
            signal, rate = sf.read(io.BytesIO(payload), dtype="float32", always_2d=True)
            signal = signal.mean(axis=1)
            if rate != 16000:
                divisor = math.gcd(rate, 16000)
                signal = resample_poly(signal, 16000 // divisor, rate // divisor)
            if not np.isfinite(signal).all() or np.sqrt(np.mean(signal ** 2)) < 1e-5:
                rejected["nonfinite_or_near_silent"] += 1; continue
            if np.mean(np.abs(signal) >= 32760 / 32768) > .01:
                rejected["over_one_percent_clipping"] += 1; continue
            pcm = np.clip(np.rint(signal * 32768), -32768, 32767).astype("<i2")
            pcm_digest = hashlib.sha256(pcm.tobytes()).hexdigest()
            if pcm_digest in seen_pcm:
                rejected["duplicate_pcm"] += 1; continue
            seen_pcm.add(pcm_digest)
            relative = "audio/" + row_id.split(":")[-1] + ".wav"
            sf.write(output / relative, pcm, 16000, subtype="PCM_16")
            candidates.append({"id": row_id, "speaker_id": person, "split": "train", "audio": relative,
                "text": text, "language": "vi", "source_id": REPO, "source_revision": REVISION,
                "source": "https://huggingface.co/datasets/" + REPO,
                "permission": "CC-BY-NC-ND-4.0; user-requested private non-commercial academic experiment; no redistribution/deployment",
                "accent": region, "accent_source": "ViMD region metadata", "province": raw["province_name"],
                "source_recording_id": stable("utterance_recording", raw["filename"]),
                "recording_id_granularity": "utterance_only; broadcast_episode_unavailable",
                "label_status": "publisher_provided_not_independently_reviewed", "domain": "broadcast_news",
                "encoded_audio_sha256": encoded, "duration_seconds": len(pcm) / 16000,
                "audio_sha256": sha256(output / relative), "training_label_tokens_lower": token_count})
        del table
    grouped = {a: [r for r in candidates if r["accent"] == a] for a in ("north", "central", "south")}
    if any(not g for g in grouped.values()):
        raise ValueError("Missing training region after QA")
    target = min(1800, *(sum(r["duration_seconds"] for r in group) for group in grouped.values()))
    regional = [r for group in grouped.values() for r in round_robin(group, target, 60)]
    original_vivos = [json.loads(l) for l in vivos_manifest.read_text(encoding="utf-8").splitlines() if l.strip()]
    if any(r["split"] == "test" for r in original_vivos):
        raise ValueError("Development source must not contain test")
    replay = []
    for r in original_vivos:
        path = (vivos_manifest.parent / r["audio"]).resolve()
        import wave
        with wave.open(str(path), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        replay.append({**r, "audio": os.path.relpath(path, output), "duration_seconds": duration,
                       "accent": "unknown", "source_id": "AILAB-VNUHCM/vivos", "domain": "read_speech"})
    selected_replay = round_robin([r for r in replay if r["split"] == "train"], 1200, 45)
    validation = [r for r in replay if r["split"] == "validation"]
    for r in heldout:
        path = (benchmark.parent / r["audio"]).resolve()
        validation.append({**r, "audio": os.path.relpath(path, output), "language": "vi",
            "source": "https://huggingface.co/datasets/" + REPO,
            "permission": "CC-BY-NC-ND-4.0; private non-commercial development evaluation"})
    if len(validation) != 150:
        raise ValueError("Frozen validation must be 60 VIVOS + 90 ViMD")
    rows = regional + selected_replay + validation
    for r in rows:
        if len(processor.tokenizer(r["text"].lower(), add_special_tokens=False).input_ids) + 4 > 448:
            raise ValueError("Reference exceeds decoder context")
    manifest = output / "manifest.jsonl"
    manifest.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    _, audited = audit(manifest, development=True)
    write_json(output / "eligible-candidates.private.json", candidates)
    regions = {a: {"samples": len([r for r in regional if r["accent"] == a]),
        "speakers": len({r["speaker_id"] for r in regional if r["accent"] == a}),
        "seconds": sum(r["duration_seconds"] for r in regional if r["accent"] == a),
        "provinces": sorted({r["province"] for r in regional if r["accent"] == a})} for a in grouped}
    write_json(output / "preparation.json", {"source": acquisition, "manifest_sha256": sha256(manifest),
        "benchmark_manifest_sha256": sha256(benchmark), "vivos_manifest_sha256": sha256(vivos_manifest),
        "source_script_sha256": sha256(Path(__file__)), "audit": audited, "regional_training": regions,
        "vivos_replay": {"samples": len(selected_replay), "seconds": sum(r["duration_seconds"] for r in selected_replay)},
        "qa_rejections": dict(rejected), "overlap_exclusions": dict(overlap),
        "selection": {"seed": 42, "region_budget_seconds": target, "speaker_cap_seconds": 60,
            "vivos_replay_budget_seconds": 1200, "vivos_speaker_cap_seconds": 45, "replacement": False},
        "label_policy": "Published labels + automated structural/audio QA only; not marked human-reviewed by this project",
        "test_evaluated": False, "augmentation": "none; isolate the new-source exploratory round",
        "limitations": ["Limited train shards/provinces", "Unknown cross-corpus identities and pretraining overlap",
            "No broadcast episode IDs; cannot assert episode-disjointness", "Not a data-only causal ablation: learning rate also reduced"]})
    print(json.dumps({"audit": audited, "regions": regions, "qa_rejections": dict(rejected)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "benchmark", "vivos-manifest", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    prepare(args.source.resolve(), args.benchmark.resolve(), args.vivos_manifest.resolve(), args.output.resolve())
