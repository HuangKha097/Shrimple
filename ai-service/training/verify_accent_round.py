"""Verify completed accent trial inputs, frozen sources, artifacts and reproduced metrics."""
import argparse
import json
from pathlib import Path

from evidence import audit, score, sha256, write_json


def verify(suite, data, report):
    run = next((suite / "trial").iterdir())
    if json.loads((run / "status.json").read_text())["status"] != "experiment_completed":
        raise ValueError("Run must finish before verification")
    plan = json.loads((suite / "plan.json").read_text())
    if sha256(data / "manifest.jsonl") != plan["manifest_sha256"]:
        raise ValueError("Changed manifest")
    rows, summary = audit(data / "manifest.jsonl", development=True)
    frozen = json.loads((run / "dataset-snapshot.private.json").read_text(encoding="utf-8"))
    if {r["id"]: r["audio_sha256"] for r in rows} != {r["id"]: r["audio_sha256"] for r in frozen}:
        raise ValueError("Changed audio")
    for name, digest in json.loads((run / "source-sha256.json").read_text()).items():
        if sha256(run / "source-snapshot" / name) != digest:
            raise ValueError("Changed frozen source")
    artifacts = json.loads((run / "artifacts-sha256.json").read_text())
    for name, digest in artifacts.items():
        if sha256(run / name) != digest:
            raise ValueError("Changed trial artifact")
    preparation = json.loads((data / "preparation.json").read_text(encoding="utf-8"))
    source = Path("ai-service/training/data/vimd-train-source-v1")
    for file in preparation["source"]["files"]:
        if sha256(source / file["local_name"]) != file["sha256"]:
            raise ValueError("Changed source parquet")
    results = json.loads((report / "results.json").read_text(encoding="utf-8"))
    for label in ("baseline", "tuned"):
        predictions = json.loads((run / f"{label}-validation-predictions.private.json").read_text(encoding="utf-8"))
        if {p["id"]: p["reference"] for p in predictions} != {r["id"]: r["text"] for r in rows if r["split"] == "validation"}:
            raise ValueError("Changed validation references")
        actual = score([(p["reference"], p["hypothesis"]) for p in predictions])
        overall = next(r for r in results["rows"] if r["group"] == "combined_validation")
        prefix = "base" if label == "baseline" else "tuned"
        if any(actual[f"{unit}_percent"] != overall[f"{prefix}_{unit}_percent"] for unit in ("wer", "cer")):
            raise ValueError("Metric reproduction failed")
    events = [json.loads(l) for l in (run / "trainer-events.jsonl").read_text().splitlines()]
    if max(r["step"] for r in events) != 600:
        raise ValueError("Trial did not complete the planned 600 steps")
    proof = {"status": "passed", "trial": run.name, "trial_artifacts_checked": len(artifacts),
        "audio_files_checked": len(rows), "source_parquets_checked": len(preparation["source"]["files"]),
        "counts": summary["counts"], "metrics_reproduced": True, "steps": 600,
        "frozen_source_snapshots_match": True, "test_evaluated": False, "deployed": False,
        "merged_model_sha256": sha256(run / "merged/model.safetensors"),
        "verifier_source_sha256": sha256(Path(__file__))}
    write_json(report / "verification.json", proof)
    print(json.dumps(proof))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("suite", "data", "report"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    verify(args.suite, args.data, args.report)
