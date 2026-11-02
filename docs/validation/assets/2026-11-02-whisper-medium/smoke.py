"""Local medium trial with synthetic English only; no call audio or secrets emitted."""
import asyncio
import io
import json
import subprocess
import time
import wave

import httpx
import app
from pcm_stream import PcmPipeline
from pcm_vad import PACKET_BYTES


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def synthesize(text):
    return subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        f"flite=text={text}:voice=slt", "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1",
    ], check=True, capture_output=True).stdout


def wav_bytes(pcm):
    result = io.BytesIO()
    with wave.open(result, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(pcm)
    return result.getvalue()


async def streaming():
    pcm = synthesize("Can you hear me") + bytes(32000)
    events = []
    class Socket:
        async def send_text(self, value):
            events.append(json.loads(value))
    pipeline = PcmPipeline(Socket(), app, "auto", "en", translate_enabled=False)
    started = time.monotonic()
    pipeline.start()
    try:
        for offset in range(0, len(pcm), PACKET_BYTES):
            await pipeline.feed(pcm[offset:offset + PACKET_BYTES].ljust(PACKET_BYTES, b"\0"))
            await asyncio.sleep(0.128)
        deadline = time.monotonic() + 70
        while pipeline.finals or pipeline.running_asr or pipeline.partial:
            if time.monotonic() > deadline:
                raise TimeoutError("Final did not settle")
            await asyncio.sleep(0.05)
    finally:
        await pipeline.close()
    finals = [e for e in events if e.get("isFinal")]
    errors = [e for e in events if e.get("type") == "error"]
    emit({"stage": "pcm", "elapsed_ms": round((time.monotonic() - started) * 1000),
          "finals": finals, "errors": errors})
    assert finals and not errors, "PCM final missing or errors emitted"


health = httpx.get(app.WHISPER_CPP_URL + "/health", timeout=10)
emit({"stage": "whisper_health", "status": health.status_code})
health.raise_for_status()
health = httpx.get("http://127.0.0.1:8001/health?mode=pcm",
                   headers={"x-api-key": app.API_KEY}, timeout=30)
emit({"stage": "ai_health", "status": health.status_code,
      "state": health.json().get("status")})
health.raise_for_status()
for case, words in [
    ("hear", "Can you hear me"),
    ("meeting", "The meeting starts at eight tonight"),
    ("intentional_repeat", "Can you hear me. Can you hear me"),
]:
    pcm = synthesize(words) + bytes(10240)
    started = time.monotonic()
    text, language = app.transcribe_audio(wav_bytes(pcm), "auto")
    emit({"stage": "asr", "case": case, "audio_seconds": round(len(pcm) / 32000, 3),
          "elapsed_ms": round((time.monotonic() - started) * 1000),
          "text": text, "language": language})
    assert text and language == "en", "Synthetic English not recognized"
asyncio.run(streaming())
