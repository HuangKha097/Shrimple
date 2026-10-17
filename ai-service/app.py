import os
import logging
import time
import math
import subprocess
import hmac
import io
import wave
from array import array

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

logger = logging.getLogger("uvicorn.error")
API_KEY = os.getenv("TRANSLATION_AI_KEY", "")
LANGUAGE_NAMES = {"en": "English", "vi": "Vietnamese"}
QWEN_URL = os.getenv("QWEN_URL", "http://qwen:8080").rstrip("/")
WHISPER_CPP_URL = os.getenv("WHISPER_CPP_URL", "http://127.0.0.1:8080").rstrip("/")
WHISPER_TIMEOUT_SECONDS = 70
TRANSLATION_TIMEOUT_SECONDS = 80
MAX_AUDIO_BYTES = 2 * 1024 * 1024
MAX_AUDIO_SECONDS = 15
AUDIO_TYPES = {"audio/webm", "audio/mp4", "audio/wav"}
SILENCE_RMS_THRESHOLD = 100


def decode_audio(content):
    try:
        decoded = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", "pipe:0", "-t", "15.0000625",
             "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
            input=content, capture_output=True, check=True, timeout=15,
        ).stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=400, detail="Invalid audio") from exc
    if not decoded or len(decoded) > MAX_AUDIO_SECONDS * 16000 * 2 or len(decoded) % 2:
        raise HTTPException(status_code=400, detail="Invalid audio duration")
    samples = array("h")
    samples.frombytes(decoded)
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(decoded)
    return output.getvalue(), rms >= SILENCE_RMS_THRESHOLD


def remaining_timeout(deadline, limit):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise HTTPException(status_code=504, detail="Inference timed out")
    return min(limit, remaining)


def whisper_ready():
    try:
        response = httpx.get(f"{WHISPER_CPP_URL}/health", timeout=2)
        return response.status_code == 200 and response.json().get("status") == "ok"
    except (httpx.HTTPError, ValueError):
        return False


def transcribe_audio(content, source_language, *, timeout=WHISPER_TIMEOUT_SECONDS):
    response = httpx.post(
        f"{WHISPER_CPP_URL}/inference",
        files={"file": ("clip.wav", content, "audio/wav")},
        data={
            "language": source_language,
            "translate": "false",
            "response_format": "verbose_json",
            "no_language_probabilities": "true",
            "no_timestamps": "true",
            "suppress_nst": "true",
            "beam_size": "3",
        },
        timeout=httpx.Timeout(timeout, connect=min(2, timeout), write=min(2, timeout), pool=min(2, timeout)),
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict) or not isinstance(result.get("text"), str):
        raise ValueError("Invalid whisper.cpp response")
    source = source_language if source_language != "auto" else {
        "english": "en", "vietnamese": "vi", "en": "en", "vi": "vi"
    }.get(str(result.get("language", "")).lower(), "")
    return result["text"].strip(), source


def translate_text(original, source, target, *, timeout=65):
    time_terms = (
        "- In Vietnamese, tonight means tối nay; today means hôm nay. Do not confuse them.\n"
        if target == "vi" else
        "- In English, tối nay means tonight; hôm nay means today. Do not confuse them.\n"
    )
    prompt = (
        f"Translate the following text from {LANGUAGE_NAMES[source]} to {LANGUAGE_NAMES[target]}.\n\n"
        "Rules:\n"
        "- Return only the translation.\n"
        "- Do not explain.\n"
        "- Preserve technical terms.\n"
        "- Preserve names.\n"
        "- Preserve exact time references.\n"
        f"{time_terms}"
        "- Keep the meaning natural and concise.\n\n"
        f'Text:\n{original}'
    )
    response = httpx.post(
        f"{QWEN_URL}/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 256,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        timeout=httpx.Timeout(timeout, connect=min(2, timeout), write=min(2, timeout), pool=min(2, timeout)),
    )
    response.raise_for_status()
    choice = response.json()["choices"][0]
    if choice.get("finish_reason") == "length":
        raise RuntimeError("Qwen translation exceeded token limit")
    translated = choice["message"]["content"].strip()
    translated = translated.strip('"“”')
    if not translated or "<think>" in translated or "</think>" in translated:
        raise RuntimeError("Qwen returned an invalid translation")
    return translated


app = FastAPI(title="Shrimple translation service")


def authorize(key):
    if not API_KEY:
        raise HTTPException(status_code=503, detail="Translation API key is not configured")
    if not key or not hmac.compare_digest(key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health(x_api_key: str | None = Header(default=None)):
    authorize(x_api_key)
    if not whisper_ready():
        raise HTTPException(status_code=503, detail={"status": "loading"})
    try:
        response = httpx.get(f"{QWEN_URL}/health", timeout=2)
        if response.status_code != 200 or response.json().get("status") != "ok":
            raise HTTPException(status_code=503, detail={"status": "loading"})
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=503, detail={"status": "loading"})
    return {"status": "ready"}


@app.post("/translate")
def translate(
    audio: UploadFile = File(...),
    target_language: str = Form(...),
    source_language: str = Form("auto"),
    x_api_key: str | None = Header(default=None),
):
    authorize(x_api_key)
    if target_language not in ("en", "vi"):
        raise HTTPException(status_code=400, detail="Unsupported target language")
    if source_language not in ("en", "vi", "auto"):
        raise HTTPException(status_code=400, detail="Unsupported source language")
    if (audio.content_type or "").split(";")[0].strip().lower() not in AUDIO_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported audio type")
    deadline = time.monotonic() + TRANSLATION_TIMEOUT_SECONDS
    content = audio.file.read(MAX_AUDIO_BYTES + 1)
    if not content or len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Invalid audio size")
    health(x_api_key)
    try:
        wav, audible = decode_audio(content)
        if not audible:
            return {"original": "", "translated": "", "source_language": "" if source_language == "auto" else source_language}
        started = time.perf_counter()
        original, source = transcribe_audio(wav, source_language,
            timeout=remaining_timeout(deadline, WHISPER_TIMEOUT_SECONDS))
        remaining_timeout(deadline, 1)
        stt_ms = round((time.perf_counter() - started) * 1000)
        logger.info("STT source=%s duration_ms=%s text_chars=%s", source, stt_ms, len(original))
        if not original:
            return {"original": "", "translated": "", "source_language": source}
        if source == target_language:
            return {"original": original, "translated": original, "source_language": source}
        if source not in LANGUAGE_NAMES:
            raise HTTPException(status_code=422, detail="Only English and Vietnamese are supported")
        started = time.perf_counter()
        translated = translate_text(original, source, target_language,
            timeout=remaining_timeout(deadline, 65))
        remaining_timeout(deadline, 1)
        logger.info("Translation source=%s target=%s duration_ms=%s", source, target_language,
                    round((time.perf_counter() - started) * 1000))
        return {"original": original, "translated": translated, "source_language": source}
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Inference timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Inference unavailable") from exc
