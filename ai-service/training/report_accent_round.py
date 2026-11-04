"""Compare the completed accent fine-tune against its own frozen baseline."""
import argparse
import csv
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from accent_benchmark import summarize, validate
from analyze_asr import aggregate
from evidence import distance, normalize, score, sha256, write_json


def paired_interval(rows, baseline, tuned, seed=42, iterations=1000):
    """Paired speaker-cluster WER change; negative favors tuned, conditional on sample."""
    clusters = defaultdict(lambda: [0, 0])
    for row in rows:
        reference = normalize(row["text"]).split()
        if not reference:
            raise ValueError("Empty reference")
        before = normalize(baseline[row["id"]]["hypothesis"]).split()
        after = normalize(tuned[row["id"]]["hypothesis"]).split()
        cluster = clusters[row["speaker_id"]]
        cluster[0] += distance(reference, after) - distance(reference, before)
        cluster[1] += len(reference)
    if len(clusters) < 5:
        return None
    keys, rng, draws = sorted(clusters), random.Random(seed), []
    for _ in range(iterations):
        sample = rng.choices(keys, k=len(keys))
        draws.append(100 * sum(clusters[k][0] for k in sample) / sum(clusters[k][1] for k in sample))
    draws.sort()
    return {"delta_pp_low": draws[int(.025 * (len(draws) - 1))],
            "delta_pp_high": draws[int(.975 * (len(draws) - 1))], "speakers": len(keys),
            "method": "paired speaker-cluster percentile bootstrap, 95%, conditional on selected validation sample",
            "seed": seed, "iterations": iterations}


def report(suite, benchmark, data, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    runs = list((suite / "trial").iterdir())
    if len(runs) != 1:
        raise ValueError("Require exactly one trial")
    run = runs[0]
    state = json.loads((run / "status.json").read_text(encoding="utf-8"))
    if state["status"] != "experiment_completed":
        raise ValueError("Trial not completed")
    plan = json.loads((suite / "plan.json").read_text(encoding="utf-8"))
    if sha256(Path(plan["manifest"])) != plan["manifest_sha256"] or sha256(Path(plan["config"])) != plan["config_sha256"]:
        raise ValueError("Frozen plan input changed")
    records = json.loads((run / "dataset-snapshot.private.json").read_text(encoding="utf-8"))
    training = [r for r in records if r["split"] == "train"]
    validation = [r for r in records if r["split"] == "validation"]
    if any(r["split"] == "test" for r in records):
        raise ValueError("Development report cannot consume test")
    accent_rows = [json.loads(l) for l in benchmark.read_text(encoding="utf-8").splitlines() if l.strip()]
    validate(accent_rows, training)
    expected = {r["id"]: r["text"] for r in validation}
    accent_ids = {r["id"] for r in accent_rows}
    vivo_ids = {r["id"] for r in validation if r["source_id"] == "AILAB-VNUHCM/vivos"}
    if len(vivo_ids) != 60 or len(accent_ids) != 90 or vivo_ids & accent_ids or vivo_ids | accent_ids != set(expected):
        raise ValueError("Validation membership changed")
    protocol = json.loads(Path(__file__).with_name("benchmark.protocol.json").read_text(encoding="utf-8"))
    predictions, metrics, accent_scores = {}, {}, {}
    for label in ("baseline", "tuned"):
        values = json.loads((run / f"{label}-validation-predictions.private.json").read_text(encoding="utf-8"))
        if len(values) != len(expected) or {r["id"]: r["reference"] for r in values} != expected:
            raise ValueError("Prediction IDs/references differ from frozen validation")
        predictions[label] = values
        accent_scores[label] = summarize(accent_rows, [r for r in values if r["id"] in accent_ids], protocol)
        metrics[label] = {
            "combined_validation": score([(p["reference"], p["hypothesis"]) for p in values]),
            "vivos_validation": score([(p["reference"], p["hypothesis"]) for p in values if p["id"] in vivo_ids]),
            "vimd_validation": accent_scores[label]["overall"]["metrics"],
            **{a: accent_scores[label]["groups"][a]["metrics"] for a in ("north", "central", "south")}}
    rows = []
    for group in metrics["baseline"]:
        base, tuned = metrics["baseline"][group], metrics["tuned"][group]
        rows.append({"group": group, "base_wer_percent": base["wer_percent"], "tuned_wer_percent": tuned["wer_percent"],
            "wer_change_percentage_points": tuned["wer_percent"] - base["wer_percent"],
            "base_cer_percent": base["cer_percent"], "tuned_cer_percent": tuned["cer_percent"],
            "reference_words": base["reference_words"], "base_word_errors": base["word_errors"], "tuned_word_errors": tuned["word_errors"]})
    comparison = json.loads((run / "comparison.json").read_text(encoding="utf-8"))
    by_label = {label: {p["id"]: p for p in values} for label, values in predictions.items()}
    paired = {group: paired_interval(items, by_label["baseline"], by_label["tuned"]) for group, items in {
        "combined_validation": validation,
        "vivos_validation": [r for r in validation if r["id"] in vivo_ids],
        "vimd_validation": accent_rows,
        **{a: [r for r in accent_rows if r["accent"] == a] for a in ("north", "central", "south")}}.items()}
    baseline_matches = (metrics["baseline"]["vivos_validation"]["wer_percent"] == plan["prior_vivos_validation_wer"]
                        and metrics["baseline"]["vimd_validation"]["wer_percent"] == plan["prior_vimd_validation_wer"])
    summary = {"trial_run": run.name, "trial_status": state["status"], "rows": rows,
        "baseline_matches_previous_diagnostic_wer": baseline_matches,
        "selected_checkpoint": comparison["selected_checkpoint"], "checkpoint_selection_metric": comparison["checkpoint_selection_metric"],
        "config": json.loads((run / "config.json").read_text()),
        "dataset": json.loads((run / "dataset-summary.json").read_text()),
        "model_source": json.loads((run / "model-source.json").read_text()),
        "training": json.loads((run / "train-metrics.json").read_text()),
        "paired_wer_change_ci95": paired,
        "peak_allocated_vram_bytes": comparison["peak_allocated_vram_bytes"],
        "generation_cap_hits": {label: sum(p["generation_limit_reached"] for p in values) for label, values in predictions.items()},
        "improves_both_corpora_observed_wer": all(metrics["tuned"][g]["wer_percent"] < metrics["baseline"][g]["wer_percent"]
                                                for g in ("vivos_validation", "vimd_validation")),
        "test_evaluated": False, "deployed": False,
        "scope": "HF fp32 development comparison only; no statistical significance or full accent/call quality claim",
        "limitations": ["600-step exploratory run changes data and learning rate, not a causal data-size ablation",
            "Publisher labels + automated QA, not independently heard/reviewed", "Limited provinces; no episode-level IDs",
            "No English/Chinese/call/terminology acceptance; no GGML quantized comparison", "Validation has guided development; final test unopened"],
        "source_script_sha256": sha256(Path(__file__)), "manifest_sha256": plan["manifest_sha256"],
        "prediction_sha256": {k: sha256(run / f"{k}-validation-predictions.private.json") for k in predictions}}
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / "results.json", summary)
    for label in accent_scores:
        write_json(output / f"{label}-accent.json", accent_scores[label])
    with (output / "results.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    for name, path in (("preparation.json", data / "preparation.json"), ("plan.json", suite / "plan.json"),
                       ("environment.json", run / "environment.json"), ("comparison.json", run / "comparison.json"),
                       ("run-status.json", run / "status.json")):
        shutil.copyfile(path, output / name)
    # Keep per-sample references/hypotheses inside the private run only.
    write_json(output / "error-counts.json", {label: {a: aggregate([p for p in values if p["id"] in
        {r["id"] for r in accent_rows if r["accent"] == a}]) for a in ("north", "central", "south")}
        for label, values in predictions.items()})
    losses = [json.loads(l) for l in (run / "trainer-events.jsonl").read_text().splitlines() if l.strip()]
    with (output / "loss-curves.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["step", "loss", "eval_loss", "learning_rate"])
        writer.writeheader()
        writer.writerows({k: row[k] for k in writer.fieldnames if k in row} for row in losses)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.7), layout="constrained")
    groups = ["vivos_validation", "north", "central", "south"]
    for i, label in enumerate(("baseline", "tuned")):
        vals = [metrics[label][g]["wer_percent"] for g in groups]
        x = [j + (i - .5) * .34 for j in range(len(groups))]
        axes[0].bar(x, vals, width=.34, label=label)
        for xx, yy in zip(x, vals):
            axes[0].text(xx, yy + .8, f"{yy:.2f}", ha="center", fontsize=8)
    axes[0].set_xticks(range(4), ["VIVOS", "North", "Central", "South"])
    axes[0].set_ylabel("WER (%) — frozen validation")
    axes[0].set_ylim(0, max(max(r["tuned_wer_percent"], r["base_wer_percent"]) for r in rows) + 20)
    axes[0].legend()
    train_losses = [r for r in losses if "loss" in r]
    eval_losses = [r for r in losses if "eval_loss" in r]
    axes[1].plot([r["step"] for r in train_losses], [r["loss"] for r in train_losses], alpha=.5, label="train")
    axes[1].plot([r["step"] for r in eval_losses], [r["eval_loss"] for r in eval_losses], "o-", label="validation")
    axes[1].set_xlabel("Optimizer step"); axes[1].set_ylabel("Loss"); axes[1].legend()
    for axis in axes:
        axis.spines[["top", "right"]].set_visible(False)
    fig.suptitle("Whisper-base LoRA | ViMD region-balanced train + VIVOS replay\nDevelopment only; no final test or serving acceptance")
    fig.savefig(output / "accent-training-results.png", dpi=160); plt.close(fig)
    write_json(output / "artifacts-sha256.json", {p.name: sha256(p) for p in output.iterdir() if p.is_file()})
    print(json.dumps({"rows": rows, "test_evaluated": False}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("suite", "benchmark", "data", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    report(args.suite, args.benchmark, args.data, args.output)
