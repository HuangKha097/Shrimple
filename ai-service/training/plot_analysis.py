"""Plot observed train/validation error analysis, not future-run results."""
import argparse
import json
from pathlib import Path


if __name__ == "__main__":
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Refusing to overwrite figure")
    s = json.loads(args.summary.read_text(encoding="utf-8"))["splits"]
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.8), layout="constrained")
    x = np.arange(2)
    for offset, label, color in [(-.18, "baseline", "#4682a9"), (.18, "tuned", "#df9b40")]:
        values = [s[k][label]["wer_percent"] for k in ("train", "validation")]
        bars = axes[0].bar(x + offset, values, width=.34, label=label, color=color)
        axes[0].bar_label(bars, labels=[f"{v:.2f}" for v in values], padding=4)
    axes[0].set(xticks=x, xticklabels=["Train (160)", "Validation (60)"], ylabel="WER (%)", ylim=(0, 38), title="Pilot train vs validation")
    axes[0].legend(frameon=False)
    speakers = s["validation"]["by_speaker"]
    deltas = [v["tuned"]["word_errors"] - v["baseline"]["word_errors"] for v in speakers.values()]
    bars = axes[1].bar([k.split(":")[-1].replace("VIVOS", "") for k in speakers], deltas, color="#df9b40")
    axes[1].bar_label(bars, padding=4)
    axes[1].set(title="Where validation deteriorated", ylabel="Additional word edits", ylim=(0, 20))
    for offset, key, title, color in [(-.18, "original_text_tokens", "Original uppercase labels", "#4682a9"), (.18, "lowercase_text_tokens", "Lowercase candidate", "#df9b40")]:
        values = [s[k]["quality"][key] for k in ("train", "validation")]
        bars = axes[2].bar(x + offset, values, width=.34, color=color, label=title)
        axes[2].bar_label(bars, padding=4, fontsize=8)
    axes[2].set(xticks=x, xticklabels=["Train", "Validation"], ylabel="Tokenizer text tokens", title="Measured casing/tokenization mismatch", ylim=(0, 11000))
    axes[2].legend(frameon=False, fontsize=8)
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
    fig.suptitle("Whisper-base pilot: train/validation diagnosis only\nLowercase token reduction is observed; quality benefit remains an untested hypothesis", fontsize=12)
    fig.savefig(args.output, dpi=180)
    plt.close(fig)
