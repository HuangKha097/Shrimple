"""Accent benchmark validation and group scores. Missing labels never become results."""
import argparse
import csv
import json
import math
import random
from collections import defaultdict
from pathlib import Path

from evidence import normalize, score, sha256, write_json

ACCENTS = {"north", "central", "south", "central_highlands", "unknown"}


def validate(rows, training_identities=()):
    if not rows:
        raise ValueError("Empty benchmark")
    seen_ids, speakers, recordings, encoded = set(), {}, {}, set()
    blocked_speakers = {r["speaker_id"] for r in training_identities}
    blocked_recordings = {r["source_recording_id"] for r in training_identities if r.get("source_recording_id")}
    blocked_encoded = {r["encoded_audio_sha256"] for r in training_identities if r.get("encoded_audio_sha256")}
    for row in rows:
        for key in ("id", "audio", "text", "speaker_id", "source_id", "source_revision", "source_recording_id", "accent_source", "audio_sha256"):
            if not isinstance(row.get(key), str) or not row[key].strip():
                raise ValueError(f"Missing required benchmark field: {key}")
        if row["id"] in seen_ids:
            raise ValueError("Duplicate benchmark id")
        seen_ids.add(row["id"])
        if row.get("accent") not in ACCENTS:
            raise ValueError("Unrecognized accent; explicit mapping or unknown required")
        if row.get("split") not in ("train", "validation", "test"):
            raise ValueError("Invalid split")
        for index, key in ((speakers, row["speaker_id"]), (recordings, row["source_recording_id"])):
            if key in index and index[key] != row["split"]:
                raise ValueError("Speaker/recording leakage across benchmark splits")
            index[key] = row["split"]
        if row["speaker_id"] in blocked_speakers or row["source_recording_id"] in blocked_recordings:
            raise ValueError("Benchmark overlaps supplied training speaker/recording identities")
        digest = row.get("encoded_audio_sha256")
        if digest and digest in blocked_encoded:
            raise ValueError("Benchmark duplicates encoded training audio")
        if row["audio_sha256"] in encoded:
            raise ValueError("Duplicate benchmark audio")
        encoded.add(row["audio_sha256"])
        duration = row.get("duration_seconds")
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            raise ValueError("Invalid duration")
        if not normalize(row["text"]):
            raise ValueError("Empty normalized reference")
        for key, values in (("speed", {"unknown", "normal", "fast"}),
                            ("accent_strength", {"unknown", "ordinary", "heavy"})):
            label = row.get(key, "unknown")
            if label not in values:
                raise ValueError(f"Invalid {key}")
            if label != "unknown" and not row.get(key + "_source"):
                raise ValueError(f"Known {key} requires annotation provenance")
    return {"samples": len(rows), "speakers": len(speakers), "recordings": len(recordings),
            "identity_note": "Supplied dataset-scoped speaker/recording IDs checked; cross-corpus identity and near-duplicate speech are not established"}


def cluster_interval(group, protocol):
    clusters = defaultdict(list)
    for row in group:
        clusters[row["speaker_id"]].append(row)
    settings = protocol["confidence"]
    if len(clusters) < settings["minimum_speakers"]:
        return None
    totals = {key: score([(r["reference"], r["hypothesis"]) for r in values]) for key, values in clusters.items()}
    keys = sorted(totals)
    rng = random.Random(settings["seed"])
    values = []
    for _ in range(settings["iterations"]):
        drawn = rng.choices(keys, k=len(keys))
        values.append(100 * sum(totals[k]["word_errors"] for k in drawn) / sum(totals[k]["reference_words"] for k in drawn))
    values.sort()
    return {"wer_percent_low": values[int(.025 * (len(values) - 1))],
            "wer_percent_high": values[int(.975 * (len(values) - 1))],
            "method": settings["method"], "confidence_level": .95,
            "note": "Exploratory cluster resampling within this selected sample, not proof of population coverage"}


def summarize(rows, predictions, protocol):
    validate(rows)
    if any(r["split"] != "validation" for r in rows):
        raise ValueError("This v1 tool scores development validation only; no automatic final-test access")
    by_id = {}
    for p in predictions:
        if p["id"] in by_id or not isinstance(p.get("hypothesis"), str):
            raise ValueError("Duplicate or invalid prediction")
        by_id[p["id"]] = p
    if set(by_id) != {r["id"] for r in rows}:
        raise ValueError("Predictions must include every frozen benchmark item, even empty/error outputs")
    merged = []
    for row in rows:
        p = by_id[row["id"]]
        if p.get("reference") != row["text"]:
            raise ValueError("Prediction reference differs from frozen reference")
        merged.append({**row, "reference": row["text"], "hypothesis": p["hypothesis"]})
    def group_result(group):
        if not group:
            return {"status": "not_measured_missing_labels_or_samples", "samples": 0, "speakers": 0, "metrics": None, "wer_ci_95": None}
        return {"status": "measured_development_only", "samples": len(group),
                "speakers": len({r["speaker_id"] for r in group}), "seconds": sum(r["duration_seconds"] for r in group),
                "metrics": score([(r["reference"], r["hypothesis"]) for r in group]),
                "wer_ci_95": cluster_interval(group, protocol)}
    groups = {accent: group_result([r for r in merged if r["accent"] == accent])
              for accent in protocol["primary_accents"] + protocol["auxiliary_accents"]}
    groups["fast"] = group_result([r for r in merged if r.get("speed") == "fast"])
    groups["heavy"] = group_result([r for r in merged if r.get("accent_strength") == "heavy"])
    coverage = []
    for accent in protocol["primary_accents"]:
        group = groups[accent]
        if (group["speakers"] < protocol["minimum_speakers_per_primary_accent"]
                or group.get("seconds", 0) < protocol["minimum_seconds_per_primary_accent"]):
            coverage.append(accent)
    primary = [groups[a]["metrics"] for a in protocol["primary_accents"]]
    complete = all(m is not None for m in primary)
    return {"benchmark_id": protocol["benchmark_id"], "stage": "development",
            "overall": group_result(merged), "groups": groups,
            "macro_north_central_south_wer": sum(m["wer_percent"] for m in primary) / 3 if complete else None,
            "worst_north_central_south_wer": max(m["wer_percent"] for m in primary) if complete else None,
            "insufficient_primary_group_coverage": coverage, "ready_for_final_acceptance": False,
            "targets_status": protocol["user_example_targets_status"],
            "overlap_note": "Accent groups partition samples; fast/heavy are overlapping cohorts. Missing group is not zero WER.",
            "reference_policy": "Verbatim source transcript; normalization inherited from evidence.py; no guessed accent/speed/age"}


def balanced_plan(rows, seconds_per_region=3600, seconds_per_speaker=300, seed=42):
    """Without-replacement training recipe; insufficient regions block auto training."""
    if seconds_per_region <= 0 or seconds_per_speaker <= 0:
        raise ValueError("Positive budgets required")
    train = [r for r in rows if r.get("split") == "train"]
    groups = {a: [r for r in train if r.get("accent") == a] for a in ("north", "central", "south")}
    missing = [a for a, group in groups.items() if not group]
    if missing:
        return {"status": "blocked_missing_region_data", "ready_for_auto_train": False, "missing": missing,
                "selected_ids": [], "unique_seconds_by_region": {a: sum(r["duration_seconds"] for r in group) for a, group in groups.items()}}
    target = min(seconds_per_region, *(sum(r["duration_seconds"] for r in g) for g in groups.values()))
    selected, durations = [], {}
    rng = random.Random(seed)
    for accent, group in groups.items():
        people = defaultdict(list)
        for row in group:
            people[row["speaker_id"]].append(row)
        for person in people:
            rng.shuffle(people[person])
        people = dict(sorted(people.items()))
        used = defaultdict(float)
        total = 0
        while True:
            progress = False
            for person, candidates in people.items():
                while candidates:
                    row = candidates.pop()
                    duration = row["duration_seconds"]
                    if used[person] + duration <= seconds_per_speaker and total + duration <= target:
                        selected.append(row["id"]); total += duration; used[person] += duration
                        progress = True
                        break
            if not progress:
                break
        durations[accent] = total
    if not all(durations.values()):
        return {"status": "blocked_budget_too_small", "ready_for_auto_train": False,
                "selected_ids": [], "unique_seconds_by_region": durations}
    return {"status": "recipe_only_requires_source_QA_and_training_validation", "ready_for_auto_train": False,
            "selected_ids": selected, "unique_seconds_by_region": durations, "seed": seed,
            "duplicates_created": False, "note": "Recipe is not a trained/accepted model. Never turn repeated exposures into unique-hour claims."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--predictions", required=True, type=Path)
    parser.add_argument("--protocol", type=Path, default=Path(__file__).with_name("benchmark.protocol.json"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    result = summarize(rows, json.loads(args.predictions.read_text(encoding="utf-8")),
                       json.loads(args.protocol.read_text(encoding="utf-8")))
    args.output.mkdir(parents=True, exist_ok=False)
    write_json(args.output / "summary.json", {**result, "manifest_sha256": sha256(args.manifest),
               "predictions_sha256": sha256(args.predictions), "protocol_sha256": sha256(args.protocol)})
    with (args.output / "groups.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["group", "status", "samples", "speakers", "wer_percent", "cer_percent"])
        writer.writeheader()
        for group, value in result["groups"].items():
            writer.writerow({"group": group, "status": value["status"], "samples": value["samples"],
                             "speakers": value["speakers"], "wer_percent": (value["metrics"] or {}).get("wer_percent", ""),
                             "cer_percent": (value["metrics"] or {}).get("cer_percent", "")})
