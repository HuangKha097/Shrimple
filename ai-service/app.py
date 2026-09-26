import os
import logging
import time
import math
import subprocess
from array import array

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

logger = logging.getLogger("uvicorn.error")
API_KEY = os.getenv("TRANSLATION_AI_KEY", "")
LANGUAGE_NAMES = {"en": "English", "vi": "Vietnamese"}
QWEN_URL = os.getenv("QWEN_URL", "http://qwen:8080").rstrip("/")
WHISPER_CPP_URL = os.getenv("WHISPER_CPP_URL", "http://127.0.0.1:8080").rstrip("/")
WHISPER_TIMEOUT_SECONDS = 70
SILENCE_RMS_THRESHOLD = 100


def has_audible_audio(content):
    decoded = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", "pipe:0", "-t", "15",
         "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"],
        input=content, capture_output=True, check=True, timeout=15,
    ).stdout
    samples = array("h")
    samples.frombytes(decoded)
    if not samples:
        return False
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
    return rms >= SILENCE_RMS_THRESHOLD


def whisper_ready():
    try:
        response = httpx.get(f"{WHISPER_CPP_URL}/health", timeout=2)
        return response.status_code == 200 and response.json().get("status") == "ok"
    except (httpx.HTTPError, ValueError):
        return False


def transcribe_audio(content, content_type, source_language):
    extension = "mp4" if content_type == "audio/mp4" else "webm"
    response = httpx.post(
        f"{WHISPER_CPP_URL}/inference",
        files={"file": (f"clip.{extension}", content, content_type or "application/octet-stream")},
        data={
            "language": source_language,
            "translate": "false",
            "response_format": "verbose_json",
            "no_language_probabilities": "true",
            "no_timestamps": "true",
            "suppress_nst": "true",
            "beam_size": "3",
        },
        timeout=WHISPER_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict) or not isinstance(result.get("text"), str):
        raise ValueError("Invalid whisper.cpp response")
    source = source_language if source_language != "auto" else {
        "english": "en", "vietnamese": "vi", "en": "en", "vi": "vi"
    }.get(str(result.get("language", "")).lower(), "")
    return result["text"].strip(), source


def translate_text(original, source, target):
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
            "max_tokens": 64,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        timeout=65,
    )
    response.raise_for_status()
    translated = response.json()["choices"][0]["message"]["content"].strip()
    translated = translated.strip('"“”')
    if not translated or "<think>" in translated or "</think>" in translated:
        raise RuntimeError("Qwen returned an invalid translation")
    return translated


app = FastAPI(title="Shrimple translation service")


def authorize(key):
    if API_KEY and key != API_KEY:
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
    health(x_api_key)
    content = audio.file.read(2 * 1024 * 1024 + 1)
    if not content or len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Invalid audio size")
    try:
        if not has_audible_audio(content):
            return {"original": "", "translated": "", "source_language": "" if source_language == "auto" else source_language}
        started = time.perf_counter()
        original, source = transcribe_audio(content, audio.content_type, source_language)
        stt_ms = round((time.perf_counter() - started) * 1000)
        logger.info("STT source=%s duration_ms=%s text_chars=%s", source, stt_ms, len(original))
        if not original:
            return {"original": "", "translated": "", "source_language": source}
        if source == target_language:
            return {"original": original, "translated": original, "source_language": source}
        if source not in LANGUAGE_NAMES:
            raise HTTPException(status_code=422, detail="Only English and Vietnamese are supported")
        started = time.perf_counter()
        translated = translate_text(original, source, target_language)
        logger.info("Translation source=%s target=%s duration_ms=%s", source, target_language,
                    round((time.perf_counter() - started) * 1000))
        return {"original": original, "translated": translated, "source_language": source}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Inference unavailable") from exc
