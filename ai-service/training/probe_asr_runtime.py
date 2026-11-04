"""Replay a fixed local diagnostic pack through real whisper.cpp; no audio upload outside Docker.

Run inside the AI container with /app on PYTHONPATH. Private predictions go to
the supplied ignored pack directory; stdout contains aggregate metrics only.
"""
import argparse
import json
import math
import statistics
import time
import wave
from pathlib import Path

import httpx
import app
from evidence import score, sha256, write_json


def probe(pack, label, profiles):
    rows = json.loads((pack / "manifest.json").read_text(encoding="utf-8"))
    result = {"label": label, "samples": len(rows), "manifest_sha256": sha256(pack / "manifest.json"),
              "profiles": {}}
    for profile in profiles:
        predictions = []
        for row in rows:
            path = pack / row["audio"]
            if sha256(path) != row["audio_sha256"]:
                raise ValueError("Changed audio")
            with wave.open(str(path), "rb") as audio:
                seconds = audio.getnframes() / audio.getframerate()
            short_context = min(1500, max(128, math.ceil((seconds + 1) * 50)))
            params = dict(language="vi", translate="false", response_format="verbose_json",
                no_language_probabilities="true", no_timestamps="false", token_timestamps="false",
                suppress_nst="true", beam_size="1", best_of="1", temperature="0.0",
                temperature_inc="0.0", max_context="0", audio_ctx=str(short_context))
            if profile != "short":
                params["audio_ctx"] = "0"
            if profile == "full_text":
                params["no_timestamps"] = "true"
            started = time.perf_counter()
            response = httpx.post(f"{app.PHOWHISPER_CPP_URL}/inference", data=params,
                files={"file": ("clip.wav", path.read_bytes(), "audio/wav")}, timeout=70)
            response.raise_for_status()
            value = response.json()
            predictions.append(dict(id=row["id"], reference=row["text"], hypothesis=value["text"].strip(),
                duration=seconds, seconds=time.perf_counter() - started,
                abnormal=app.abnormal_recognition(value, seconds)))
        write_json(pack / f"{label}-{profile}.private.json", predictions)
        result["profiles"][profile] = dict(metrics=score([(p["reference"], p["hypothesis"]) for p in predictions]),
            median_seconds=statistics.median(p["seconds"] for p in predictions),
            max_seconds=max(p["seconds"] for p in predictions),
            abnormal=sum(p["abnormal"] for p in predictions))
        write_json(pack / f"{label}-summary.json", result)
        print(json.dumps({"label": label, "profile": profile, **result["profiles"][profile]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--profiles", nargs="+", choices=("short", "full", "full_text"), default=["short", "full", "full_text"])
    args = parser.parse_args()
    probe(args.pack, args.label, args.profiles)
