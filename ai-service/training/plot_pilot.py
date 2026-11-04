"""Export a report figure from actual run artifacts (requires matplotlib)."""
import argparse
import json
from pathlib import Path


def main():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--diagnostic", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Refusing to overwrite report figure")
    comparison = json.loads((args.run / "comparison.json").read_text(encoding="utf-8"))
    diagnostic = json.loads(args.diagnostic.read_text(encoding="utf-8"))
    logs = [json.loads(line) for line in (args.run / "trainer-events.jsonl").read_text(encoding="utf-8").splitlines()]
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.8), layout="constrained")
    for ax, title, values in (
        (axes[0], "VIVOS test: 60 utterances, 3 speakers", [comparison[k]["wer_percent"] for k in ("baseline_test", "tuned_test")]),
        (axes[1], "User diagnostic: 13 clips, 1 speaker", [diagnostic[k]["wer_percent"] for k in ("baseline", "tuned")]),
    ):
        bars = ax.bar(["Base", "LoRA (40 steps)"], values, color=["#4682a9", "#df9b40"], width=.6)
        ax.bar_label(bars, labels=[f"{value:.2f}%" for value in values], padding=5)
        ax.set(title=title, ylabel="WER (%) — lower is better", ylim=(0, max(values) * 1.25))
        ax.spines[["top", "right"]].set_visible(False)
    training = [r for r in logs if "loss" in r]
    validation = [r for r in logs if "eval_loss" in r]
    axes[2].plot([r["step"] for r in training], [r["loss"] for r in training], label="Train loss", color="#4682a9")
    axes[2].scatter([r["step"] for r in validation], [r["eval_loss"] for r in validation], label="Validation loss", color="#df9b40", zorder=3)
    axes[2].set(title="Training trace", xlabel="Optimizer step", ylabel="Cross-entropy loss")
    axes[2].legend(frameon=False)
    axes[2].spines[["top", "right"]].set_visible(False)
    fig.suptitle("Whisper base LoRA pilot — GTX 1650 SUPER, HF fp32\nSmall read-speech pilot; diagnostic set is separate; no serving deployment", fontsize=12)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=180)
    plt.close(fig)


if __name__ == "__main__":
    main()
