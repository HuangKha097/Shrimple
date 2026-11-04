"""Execute the frozen four-trial development plan sequentially with durable evidence."""
import argparse
import json
import os
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path

from evidence import audit, sha256, write_json
from finetune import OPTIONAL_CONFIG, validate_config

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def utc():
    return datetime.now(timezone.utc).isoformat()


def latest_progress(trial_dir):
    runs = list(trial_dir.iterdir()) if trial_dir.exists() else []
    if len(runs) != 1:
        return {}
    events = runs[0] / "trainer-events.jsonl"
    if not events.exists():
        return {"phase": "baseline_or_model_load"}
    for line in reversed(events.read_text(encoding="utf-8").splitlines()):
        try:
            event = json.loads(line)
            return {k: event[k] for k in ("step", "loss", "eval_loss", "learning_rate") if k in event}
        except json.JSONDecodeError:
            continue
    return {}


def execute(plan_path, suite):
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    manifest = REPO / plan["manifest"]
    expected_source = {name: sha256(ROOT / name) for name in ("finetune.py", "evidence.py", "requirements.txt")}

    def verify_inputs():
        if sha256(manifest) != plan["manifest_sha256"]:
            raise ValueError("Manifest differs from frozen plan")
        for trial in plan["trials"]:
            path = REPO / trial["config"]
            if sha256(path) != trial["config_sha256"]:
                raise ValueError("Config differs from frozen plan")
            config = {**OPTIONAL_CONFIG, **json.loads(path.read_text(encoding="utf-8"))}
            validate_config(config)
            if config["evaluation_scope"] != "development" or config["revision"] != plan["model_revision"]:
                raise ValueError("Require pinned development config")
        if any(sha256(ROOT / name) != digest for name, digest in expected_source.items()):
            raise ValueError("Training source changed during suite")

    verify_inputs()
    records, dataset = audit(manifest, development=True)
    audio_hashes = {r["id"]: r["audio_sha256"] for r in records}
    state = {"status": "running", "started_utc": utc(), "plan_sha256": sha256(plan_path),
             "training_source_sha256": expected_source, "trials": [], "test_evaluated": False}
    write_json(suite / "suite-status.json", state)
    write_json(suite / "plan.snapshot.json", plan)
    write_json(suite / "dataset-summary.json", dataset)
    write_json(suite / "audio-hashes.private.json", audio_hashes)
    baseline_signature = None
    results = []
    for trial in plan["trials"]:
        verify_inputs()
        current, _ = audit(manifest, development=True)
        if {r["id"]: r["audio_sha256"] for r in current} != audio_hashes:
            raise ValueError("Audited audio changed between trials")
        name = trial["name"]
        if name not in ("control", "warmup", "low-lr", "lowercase"):
            raise ValueError("Unexpected trial name")
        trial_dir = suite / "trials" / name
        trial_dir.mkdir(parents=True, exist_ok=False)
        entry = {"name": name, "status": "running", "started_utc": utc(),
                 "config_sha256": trial["config_sha256"]}
        state["trials"].append(entry)
        state["active_trial"] = name
        write_json(suite / "suite-status.json", state)
        print(f"START {name} (600 steps)", flush=True)
        log = suite / f"{name}.console.private.txt"
        args = [sys.executable, "-u", str(ROOT / "finetune.py"), "train",
                "--manifest", str(manifest), "--config", str(REPO / trial["config"]),
                "--runs", str(trial_dir), "--device", "cuda", "--purpose", "research"]
        with log.open("x", encoding="utf-8") as stream:
            process = subprocess.Popen(args, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            try:
                while process.poll() is None:
                    progress = latest_progress(trial_dir)
                    entry["progress"] = progress
                    state["heartbeat_utc"] = utc()
                    write_json(suite / "suite-status.json", state)
                    print(f"PROGRESS {name} {json.dumps(progress)}", flush=True)
                    time.sleep(20)
            except BaseException:
                process.terminate()
                process.wait(timeout=30)
                raise
        entry.update(exit_code=process.returncode, finished_utc=utc())
        runs = list(trial_dir.iterdir())
        entry["status"] = "failed"
        if process.returncode == 0 and len(runs) == 1:
            run = runs[0]
            status = json.loads((run / "status.json").read_text(encoding="utf-8"))
            comparison = json.loads((run / "comparison.json").read_text(encoding="utf-8"))
            source = json.loads((run / "model-source.json").read_text(encoding="utf-8"))
            for path, digest in json.loads((run / "artifacts-sha256.json").read_text(encoding="utf-8")).items():
                if sha256(run / path) != digest:
                    raise ValueError("Run artifact checksum failed")
            if (status["status"] != "experiment_completed" or comparison["evaluation_scope"] != "development"
                    or comparison["baseline_test"] is not None or comparison["tuned_test"] is not None
                    or list(run.glob("*test-metrics.json")) or source["resolved_revision"] != plan["model_revision"]):
                raise ValueError("Run violated development protocol")
            baseline = comparison["baseline_validation"]
            signature = {k: baseline[k] for k in ("word_errors", "reference_words", "char_errors", "reference_chars", "samples")}
            if baseline_signature is not None and signature != baseline_signature:
                raise ValueError("Baseline predictions differ across trials; review comparability")
            baseline_signature = signature
            entry.update(status="completed", run_id=run.name,
                relative_run=str(run.relative_to(suite)),
                validation_wer=comparison["tuned_validation"]["wer_percent"],
                validation_cer=comparison["tuned_validation"]["cer_percent"])
            results.append({**entry, "comparison": comparison,
                "config": json.loads((run / "config.json").read_text(encoding="utf-8")),
                "train": json.loads((run / "train-metrics.json").read_text(encoding="utf-8")),
                "artifact_hashes_verified": True})
            print(f"COMPLETE {name}: validation WER={entry['validation_wer']:.4f}, CER={entry['validation_cer']:.4f}", flush=True)
        else:
            print(f"FAILED {name}: exit={process.returncode}; evidence retained", flush=True)
        write_json(suite / "results.partial.json", results)
        write_json(suite / "suite-status.json", state)
    all_done = len(results) == len(plan["trials"])
    state.update(status="completed" if all_done else "completed_with_failures", finished_utc=utc(), active_trial=None)
    ranked = sorted(results, key=lambda r: (r["validation_wer"], r["validation_cer"]))
    summary = {"suite_id": suite.name, "status": state["status"], "dataset": dataset,
        "baseline_validation": results[0]["comparison"]["baseline_validation"] if results else None,
        "trials": results, "selected_by_validation": ranked[0]["name"] if all_done else None,
        "test_evaluated": False, "acceptance": "Development comparison only; no test/generalization/serving acceptance"}
    write_json(suite / "summary.json", summary)
    write_json(suite / "suite-status.json", state)
    print(f"SUITE {state['status']}: {len(results)}/{len(plan['trials'])} trials", flush=True)
    return 0 if all_done else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--runs", type=Path, default=ROOT / "runs")
    args = parser.parse_args()
    os.environ.setdefault("HF_HOME", str(REPO / ".cache" / "huggingface"))
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    suite = args.runs.resolve() / ("development-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:6])
    suite.mkdir(parents=True, exist_ok=False)
    print(f"PRIVATE SUITE: {suite}", flush=True)
    try:
        raise SystemExit(execute(args.plan.resolve(), suite))
    except Exception as exc:
        (suite / "error.private.txt").write_text(traceback.format_exc(), encoding="utf-8")
        status = json.loads((suite / "suite-status.json").read_text(encoding="utf-8")) if (suite / "suite-status.json").exists() else {}
        status.update(status="failed", error_type=type(exc).__name__, finished_utc=utc())
        write_json(suite / "suite-status.json", status)
        raise SystemExit(f"Suite failed: {type(exc).__name__}; inspect private evidence")
