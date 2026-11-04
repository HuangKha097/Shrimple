"""Export verified development results, CSV tables and a report figure; no test access."""
import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

from evidence import score, sha256, write_json


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_csv(path, rows):
    with path.open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def report(suite, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    summary = read(suite / "summary.json")
    state = read(suite / "suite-status.json")
    if summary["status"] != "completed" or len(summary["trials"]) != 4 or summary["test_evaluated"]:
        raise ValueError("Need all four completed development trials, with no test evaluation")
    output.mkdir(parents=True, exist_ok=True)
    names = ["results.json", "results.csv", "loss-curves.csv", "development-results.png", "artifact-integrity.json"]
    if any((output / name).exists() for name in names):
        raise ValueError("Refusing to overwrite report results")
    rows, curves, speaker_results, integrity, snapshots = [], [], {}, {}, {}
    reference_signature = None
    package_signature = None
    generation_signature = None
    for trial in summary["trials"]:
        run = suite / trial["relative_run"]
        hashes = read(run / "artifacts-sha256.json")
        for relative, expected in hashes.items():
            if sha256(run / relative) != expected:
                raise ValueError("Run integrity check failed")
        config, comparison = read(run / "config.json"), read(run / "comparison.json")
        packages = read(run / "environment.json")["packages"]
        generation = read(run / "generation.json")
        if package_signature is not None and packages != package_signature:
            raise ValueError("Installed library versions changed between trials")
        if generation_signature is not None and generation != generation_signature:
            raise ValueError("Generation settings changed between trials")
        package_signature, generation_signature = packages, generation
        if config["evaluation_scope"] != "development" or comparison["tuned_test"] is not None or comparison["baseline_test"] is not None:
            raise ValueError("Development-only protocol violated")
        if list(run.glob("*test-metrics.json")):
            raise ValueError("Unexpected test artifacts")
        records = [r for r in read(run / "dataset-snapshot.private.json") if r["split"] == "validation"]
        expected_refs = {r["id"]: r["text"] for r in records}
        if reference_signature is not None and expected_refs != reference_signature:
            raise ValueError("Validation references differ")
        reference_signature = expected_refs
        predictions = {label: read(run / f"{label}-validation-predictions.private.json") for label in ("baseline", "tuned")}
        for group in predictions.values():
            if {r["id"]: r["reference"] for r in group} != expected_refs:
                raise ValueError("Prediction/reference mismatch")
        per_speaker = {}
        for speaker in sorted({r["speaker_id"] for r in records}):
            ids = {r["id"] for r in records if r["speaker_id"] == speaker}
            per_speaker[speaker] = {label: score([(p["reference"], p["hypothesis"]) for p in group if p["id"] in ids])
                                    for label, group in predictions.items()}
        speaker_results[trial["name"]] = per_speaker
        status = read(run / "status.json")
        elapsed = (datetime.fromisoformat(status["finished_utc"]) - datetime.fromisoformat(status["started_utc"])).total_seconds()
        after = comparison["tuned_validation"]
        recalculated = score([(p["reference"], p["hypothesis"]) for p in predictions["tuned"]])
        if any(after[k] != recalculated[k] for k in ("word_errors", "reference_words", "char_errors", "reference_chars")):
            raise ValueError("Recomputed validation scores differ")
        rows.append({"trial": trial["name"], "run_id": trial["run_id"],
            "validation_samples": after["samples"], "wer_percent": after["wer_percent"], "cer_percent": after["cer_percent"],
            "word_errors": after["word_errors"], "reference_words": after["reference_words"],
            "wer_change_vs_base_pp": comparison["validation_wer_change_percentage_points"],
            "selected_checkpoint": Path(comparison["selected_checkpoint"]).name,
            "selection_metric": comparison["checkpoint_selection_metric"],
            "trainer_seconds": trial["train"]["train_runtime"], "total_run_seconds": elapsed,
            "peak_torch_allocated_mib": comparison["peak_allocated_vram_bytes"] / 1024**2,
            "generation_cap_hits": sum(p.get("generation_limit_reached", False) for p in predictions["tuned"]),
            "all_uppercase_hypotheses": sum(p["hypothesis"].isupper() for p in predictions["tuned"]),
            "learning_rate": config["learning_rate"], "warmup_steps": config["warmup_steps"], "label_case": config["label_case"]})
        snapshots[trial["name"]] = {"config": config, "generation": read(run / "generation.json"),
            "model": read(run / "model-source.json"), "manifest_sha256": read(run / "dataset-summary.json")["manifest_sha256"],
            "source_sha256": read(run / "source-sha256.json")}
        integrity[trial["name"]] = {"artifact_count": len(hashes), "all_verified": True,
                                   "run_integrity_manifest_sha256": sha256(run / "artifacts-sha256.json")}
        for line in (run / "trainer-events.jsonl").read_text(encoding="utf-8").splitlines():
            event = json.loads(line)
            if "loss" in event or "eval_loss" in event:
                curves.append({"trial": trial["name"], "step": event["step"],
                    "train_loss": event.get("loss", ""), "validation_loss": event.get("eval_loss", ""),
                    "learning_rate": event.get("learning_rate", "")})
    ranked = sorted(rows, key=lambda r: (r["wer_percent"], r["cer_percent"]))
    selected = ranked[0]["trial"]
    if selected != summary["selected_by_validation"]:
        raise ValueError("Ranking differs from suite selection")
    result = {"suite_id": suite.name, "suite_status": state["status"],
        "started_utc": state["started_utc"], "finished_utc": state["finished_utc"],
        "dataset": summary["dataset"], "baseline_validation": summary["baseline_validation"],
        "rows": rows, "selected_by_validation": selected,
        "selected_beats_base_validation_wer": ranked[0]["wer_percent"] < summary["baseline_validation"]["wer_percent"],
        "selected_model_relative_to_repo": str((suite / next(t["relative_run"] for t in summary["trials"] if t["name"] == selected) / "merged").relative_to(Path(__file__).resolve().parent.parent.parent)),
        "per_speaker": speaker_results, "config_and_provenance": snapshots,
        "test_evaluated": False, "serving_changed": False,
        "package_versions_equal_across_trials": True, "generation_equal_across_trials": True,
        "translation_model_trained_or_evaluated": False,
        "limits": "Validation selection only: 60 utterances/3 speakers, same seed, no statistical/generalization claim. Checkpoint selected by loss within each trial; do not compare loss across label cases. HF fp32, not GGML/Q5 serving."}
    write_json(output / "results.json", result)
    write_csv(output / "results.csv", rows)
    write_csv(output / "loss-curves.csv", curves)
    fig, axes = plt.subplots(2, 2, figsize=(12, 8), layout="constrained")
    labels = ["base"] + [r["trial"] for r in rows]
    for ax, key, title in ((axes[0, 0], "wer_percent", "Validation WER — lower is better"),
                           (axes[0, 1], "cer_percent", "Validation CER — lower is better")):
        values = [summary["baseline_validation"][key]] + [r[key] for r in rows]
        bars = ax.bar(labels, values, color=["#8496a0"] + ["#3478a5" if r["trial"] == selected else "#dda14e" for r in rows])
        ax.bar_label(bars, labels=[f"{v:.2f}%" for v in values], padding=4)
        ax.set(title=title, ylabel="%", ylim=(0, max(values) * 1.22))
    for trial in ("control", "warmup", "low-lr", "lowercase"):
        group = [c for c in curves if c["trial"] == trial and c["validation_loss"] != ""]
        ax = axes[1, 1] if trial == "lowercase" else axes[1, 0]
        ax.plot([c["step"] for c in group], [c["validation_loss"] for c in group], marker="o", label=trial)
    axes[1, 0].set(title="Validation loss: original-case labels", xlabel="Optimizer step", ylabel="Loss")
    axes[1, 1].set(title="Validation loss: lowercase labels (separate scale)", xlabel="Optimizer step", ylabel="Loss")
    for ax in axes.flat:
        ax.spines[["top", "right"]].set_visible(False)
    axes[1, 0].legend(frameon=False)
    axes[1, 1].legend(frameon=False)
    fig.suptitle("Whisper-base LoRA development — 4 frozen configs, 600 steps each\n2,150 train utterances / 43 speakers; validation 60 / 3; final test untouched", fontsize=12)
    fig.savefig(output / "development-results.png", dpi=180)
    plt.close(fig)
    write_json(output / "artifact-integrity.json", {"trials": integrity,
        "derived_sha256": {name: sha256(output / name) for name in names if name != "artifact-integrity.json"},
        "source_script_sha256": sha256(Path(__file__))})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = report(args.suite.resolve(), args.output.resolve())
    print(json.dumps({"suite": result["suite_id"], "selected_by_validation": result["selected_by_validation"], "test_evaluated": False}))
