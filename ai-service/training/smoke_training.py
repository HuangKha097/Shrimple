"""Run a one-step CPU plumbing check on artificial tones, NOT ASR research."""
import json
import argparse
import math
import struct
import subprocess
import sys
import uuid
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--development", action="store_true")
    args = parser.parse_args()
    folder = ROOT / "data" / ("synthetic-smoke-" + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True)
    rows = []
    splits = ("train", "validation") if args.development else ("train", "validation", "test")
    for i, split in enumerate(splits):
        name = f"tone-{i}.wav"
        with wave.open(str(folder / name), "wb") as stream:
            stream.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            stream.writeframes(b"".join(struct.pack("<h", int(1000 * math.sin(j * (i + 1) / 10))) for j in range(1600)))
        rows.append(dict(id=f"synthetic-{i}", audio=name, text="Kiểm thử công cụ.",
                         speaker_id=f"synthetic-not-person-{i}", split=split, language="vi",
                         source="artificial tone, no speech", permission="locally generated fixture"))
    (folder / "manifest.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    config = json.loads((ROOT / "config.base-lora.json").read_text())
    config.update(max_steps=1, gradient_accumulation_steps=1, eval_steps=1, max_new_tokens=2)
    if args.development:
        config.update(max_steps=2, warmup_steps=1, label_case="lower",
                      evaluation_scope="development", load_best_model_at_end=True)
    (folder / "config.json").write_text(json.dumps(config), encoding="utf-8")
    return subprocess.call([sys.executable, str(ROOT / "finetune.py"), "train", "--manifest",
                            str(folder / "manifest.jsonl"), "--config", str(folder / "config.json"),
                            "--device", "cpu", "--purpose", "smoke"])


if __name__ == "__main__":
    raise SystemExit(main())
