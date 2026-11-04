"""Local authenticated PCM replay with real VAD/ASR/MT; stdout never contains speech/key.

This checks the internal AI lane, not JWT/call membership or physical WebRTC.
"""
import argparse
import asyncio
import json
import statistics
import time
import wave
from pathlib import Path

import app
from pcm_vad import PACKET_BYTES
from evidence import score, write_json
from websockets.asyncio.client import connect


async def replay(pack, source, target, count, label, url="ws://127.0.0.1:8001/stream/pcm", *, save_events=False):
    rows = json.loads((pack / "manifest.json").read_text(encoding="utf-8"))[:count]
    audio = bytes(8192)
    for row in rows:
        with wave.open(str(pack / row["audio"]), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
                raise ValueError("Require mono PCM16 16kHz")
            audio += wav.readframes(wav.getnframes()) + bytes(20480)
    audio += bytes(32768)
    audio += bytes((-len(audio)) % PACKET_BYTES)
    events = []
    started = time.perf_counter()
    async with connect(url, additional_headers={"x-api-key": app.API_KEY},
                       compression=None, max_size=65536, open_timeout=10) as socket:
        await socket.send(json.dumps(dict(sourceLanguage=source, targetLanguage=target)))
        ready = json.loads(await asyncio.wait_for(socket.recv(), 10))
        if ready.get("type") != "ready":
            raise RuntimeError(f"Stream not ready: {ready.get('status')}")
        stream_started = time.perf_counter()

        async def receive():
            async for data in socket:
                events.append({**json.loads(data), "elapsed": time.perf_counter() - started})
        receiver = asyncio.create_task(receive())
        try:
            for offset in range(0, len(audio), PACKET_BYTES):
                await socket.send(audio[offset:offset + PACKET_BYTES])
                await asyncio.sleep(max(0, stream_started + (offset + PACKET_BYTES) / 32000 - time.perf_counter()))
            # Give final recognition and translation a bounded drain period.
            deadline = time.perf_counter() + 15
            while time.perf_counter() < deadline:
                finals = [e for e in events if e["type"] == "transcript" and e.get("isFinal")]
                translations = [e for e in events if e["type"] == "translation"]
                if finals and len(translations) == len(finals) and time.perf_counter() - started - events[-1]["elapsed"] > 2:
                    break
                await asyncio.sleep(.1)
        finally:
            receiver.cancel()
            await asyncio.gather(receiver, return_exceptions=True)
    finals = [e for e in events if e["type"] == "transcript" and e.get("isFinal")]
    translations = [e for e in events if e["type"] == "translation"]
    final_ids = {(e["utteranceId"], e["revision"]) for e in finals}
    translated_ids = {(e["utteranceId"], e["revision"]) for e in translations}
    final_times = {(e["utteranceId"], e["revision"]): e["elapsed"] for e in finals}
    delays = [e["elapsed"] - final_times[(e["utteranceId"], e["revision"])]
              for e in translations if (e["utteranceId"], e["revision"]) in final_times]
    result = dict(label=label, source=source, target=target, input_clips=len(rows),
        audio_seconds=len(audio) / 32000, wall_seconds=time.perf_counter() - started,
        partials=sum(e["type"] == "transcript" and not e.get("isFinal") for e in events),
        finals=len(finals), translations=len(translations), revisions_match=bool(final_ids) and final_ids == translated_ids,
        median_translation_after_final_seconds=statistics.median(delays) if delays else None,
        errors=[{"status": e.get("status"), "type": e["type"]} for e in events if e["type"] in ("error", "status")],
        asr_metrics=score([(" ".join(r["text"] for r in rows), " ".join(e["original"] for e in finals))]))
    if save_events:
        write_json(pack / f"{label}-pcm-events.private.json", events)
    write_json(pack / f"{label}-pcm-summary.json", result)
    print(json.dumps(result), flush=True)
    if not result["revisions_match"] or any(e["type"] == "error" for e in events):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--source", choices=("en", "vi"), required=True)
    parser.add_argument("--target", choices=("en", "vi"), required=True)
    parser.add_argument("--count", type=int, default=2)
    parser.add_argument("--label", required=True)
    parser.add_argument("--url", default="ws://127.0.0.1:8001/stream/pcm")
    parser.add_argument("--save-events", action="store_true",
                        help="Opt in to saving dataset transcripts locally; keep disabled for real calls")
    args = parser.parse_args()
    asyncio.run(replay(args.pack, args.source, args.target, args.count, args.label, args.url,
                       save_events=args.save_events))
