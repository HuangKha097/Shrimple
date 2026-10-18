"""Exercise the edited recognizer against live Whisper with synthetic/public audio."""
import asyncio
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import wave

import app
from pcm_stream import PcmPipeline
from pcm_vad import PACKET_BYTES


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def synthesize(text):
    return subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        f"flite=text={text}:voice=slt", "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1"],
        check=True, capture_output=True).stdout


def wav_bytes(pcm):
    result = io.BytesIO()
    with wave.open(result, "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(pcm)
    return result.getvalue()


def direct():
    for name, words in [("hear", "Can you hear me"), ("happening", "What is happening"),
                        ("meeting", "The meeting starts at eight tonight"),
                        ("intentional_repeat", "Can you hear me. Can you hear me")]:
        pcm = synthesize(words) + bytes(10240)
        started = time.monotonic()
        calls = []
        original_post = app.httpx.post
        def recorded_post(*args, **kwargs):
            result = original_post(*args, **kwargs)
            calls.append({"audio_ctx": kwargs["data"]["audio_ctx"], "beam_size": kwargs["data"]["beam_size"]})
            return result
        app.httpx.post = recorded_post
        try:
            text, _ = app.transcribe_audio(wav_bytes(pcm), "en")
            emit({"kind": "direct", "case": name, "audio_seconds": round(len(pcm)/32000, 3),
                  "elapsed_ms": round((time.monotonic()-started)*1000), "text": text, "calls": calls})
        except Exception as exc:
            emit({"kind": "direct", "case": name, "error": getattr(exc, "status_code", type(exc).__name__), "calls": calls})
        finally:
            app.httpx.post = original_post


async def streaming():
    with wave.open(str(Path(app.__file__).parent / "testdata/jfk-2s.wav"), "rb") as wav:
        pcm = bytes(8192) + wav.readframes(wav.getnframes()) + bytes(32000 * 6)
    started = time.monotonic()
    events = []
    class Socket:
        async def send_text(self, value):
            event = json.loads(value)
            events.append(event)
            emit({"kind": "pcm", "elapsed_ms": round((time.monotonic()-started)*1000), **event})
    pipeline = PcmPipeline(Socket(), app, "en", "en", translate_enabled=False)
    pipeline.start()
    try:
        for offset in range(0, len(pcm), PACKET_BYTES):
            await pipeline.feed(pcm[offset:offset+PACKET_BYTES].ljust(PACKET_BYTES, b"\0"))
            await asyncio.sleep(0.128)
        deadline = time.monotonic() + 15
        while pipeline.finals or pipeline.running_asr:
            if time.monotonic() > deadline:
                raise TimeoutError("Final never settled")
            await asyncio.sleep(0.05)
    finally:
        await pipeline.close()
    assert any(event.get("isFinal") for event in events), "No clean final emitted"
    assert not any(event["type"] == "error" for event in events), "PCM failed"


if len(sys.argv) > 1 and sys.argv[1] == "pcm":
    asyncio.run(streaming())
else:
    direct()
