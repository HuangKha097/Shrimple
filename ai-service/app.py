import os
import logging
import time
import threading
import math
import subprocess
import hashlib
import hmac
import io
import urllib.request
import wave
import json
import sys
from array import array
from pathlib import Path

import httpx
import anyio
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import StreamingResponse

from pcm_stream import pcm_socket
from pcm_vad import get_model

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
CT2_MODEL_DIR = Path(os.getenv("CT2_MODEL_DIR", "/models/ct2"))
CT2_SPECS = {
    "en-vi": {
        "repo": "dekthedev/opus-mt-en-vi-ct2-int8",
        "revision": "c22547827b876e8ee939d6a9363965e5c9f769e1",
        "prefix": [">>vie<<"],
        "files": {
            "config.json": "4244772990e30069563e3ddfb4ad6dc95bdfd2ac3de667ea8858c9b0a8433fa8",
            "model.bin": "53a1d87fbcdfe1b95e51a8da90b673208895fc986507b68dcd4a8031ca54676c",
            "shared_vocabulary.json": "5f2a279e57b170f567fb605bd44fb40f8ed22f73a06648eefa9b877831e95a3e",
            "source.spm": "fdd9ab486ca8ea060967105e30db7d8928729c78a67448711d2dd7c3153b37cd",
            "target.spm": "fb8ad63c818f073c246952c91b2cb1f16aa30728bf51b5c179b8481bc0e20bb5",
        },
    },
    "vi-en": {
        "repo": "dekthedev/opus-mt-vi-en-ct2-int8",
        "revision": "14a921f3c4b7238b2b49d247e53810f0f7c78236",
        "prefix": [],
        "files": {
            "config.json": "4244772990e30069563e3ddfb4ad6dc95bdfd2ac3de667ea8858c9b0a8433fa8",
            "model.bin": "da0c1a36f92c9826f5ce28e01d9301e4cbbde47f2923ade0c030fc75e5b3d251",
            "shared_vocabulary.json": "1a261fb75cbe05d3f184b74199aecb8c764859d1324dd3203f080f3c181b4db5",
            "source.spm": "9deb4f9e7bebd3876f4bf238a9eb52f2f95a1fba2210a4a8239167c55c15e67d",
            "target.spm": "629182070d11db929990c603779345a11743b749f6586f224829303fa979c138",
        },
    },
}
_ct2_lock = threading.Lock()
_ct2_cache = {}
# Streaming ASR can advance while the previous text is being translated. Each
# model still has only one job at a time, with no unbounded inference queue.
stt_slot = threading.Lock()
text_translation_slot = threading.Lock()
inference_slot = stt_slot  # Retain the existing admission-control alias.


def has_cuda_gpu(ct2_module=None, ort_module=None):
    if os.getenv("WHISPER_GPU", "").strip().lower() == "true":
        return True
    try:
        if ct2_module is None:
            import ctranslate2 as ct2_module
        if getattr(ct2_module, "get_cuda_device_count", lambda: 0)() > 0:
            return True
    except Exception:
        pass
    try:
        if ort_module is None:
            import onnxruntime as ort_module
        if "CUDAExecutionProvider" in getattr(ort_module, "get_available_providers", lambda: [])():
            return True
    except Exception:
        pass
    return False


def compute_profile(*, gpu_available=None, cpu_count=None):
    total_threads = max(2, int(cpu_count if cpu_count is not None else (os.cpu_count() or 2)))
    has_gpu = has_cuda_gpu() if gpu_available is None else bool(gpu_available)
    asr_threads = max(1, total_threads // 2)
    mt_threads = max(1, total_threads - asr_threads)
    if has_gpu:
        return {
            "mode": "cpu_gpu_50_50",
            "gpu": True,
            "asr_device": "gpu",
            "mt_device": "cpu",
            "vad_device": "cpu",
            "asr_share": 0.5,
            "cpu_share": 0.5,
            "asr_threads": asr_threads,
            "mt_threads": mt_threads,
        }
    return {
        "mode": "cpu_only_50_50",
        "gpu": False,
        "asr_device": "cpu",
        "mt_device": "cpu",
        "vad_device": "cpu",
        "asr_share": 0.5,
        "cpu_share": 0.5,
        "asr_threads": asr_threads,
        "mt_threads": mt_threads,
    }


def _verify_file_sha256(path, expected):
    if not path.is_file():
        return False
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(65536):
            digest.update(chunk)
    return digest.hexdigest() == expected


def _ensure_ct2_files(direction, base_dir=None):
    spec = CT2_SPECS.get(direction)
    if not spec:
        return None
    root = Path(base_dir) if base_dir is not None else CT2_MODEL_DIR
    target_dir = root / direction
    if all(_verify_file_sha256(target_dir / name, sha) for name, sha in spec["files"].items()):
        return target_dir
    if os.getenv("CT2_AUTO_DOWNLOAD", "").strip().lower() not in ("1", "true") and "CT2_MODEL_DIR" not in os.environ:
        return None
    target_dir.mkdir(parents=True, exist_ok=True)
    for name, expected in spec["files"].items():
        destination = target_dir / name
        if _verify_file_sha256(destination, expected):
            continue
        url = f"https://huggingface.co/{spec['repo']}/resolve/{spec['revision']}/{name}"
        tmp = target_dir / f"{name}.download"
        with urllib.request.urlopen(url, timeout=30) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != expected:
            raise RuntimeError(f"Checksum mismatch for {direction}/{name}")
        tmp.write_bytes(content)
        tmp.replace(destination)
    return target_dir


def get_ct2_translator(direction, *, base_dir=None):
    if direction not in CT2_SPECS:
        return None
    cache_key = (str(base_dir or CT2_MODEL_DIR), direction)
    with _ct2_lock:
        if cache_key in _ct2_cache:
            return _ct2_cache[cache_key]
        try:
            import ctranslate2
            import sentencepiece as spm
            model_dir = _ensure_ct2_files(direction, base_dir=base_dir)
            if model_dir is None:
                return None
            profile = compute_profile()
            translator = ctranslate2.Translator(
                str(model_dir),
                device="cpu",
                compute_type="int8",
                intra_threads=profile["mt_threads"],
                inter_threads=1,
            )
            source_spm = spm.SentencePieceProcessor(str(model_dir / "source.spm"))
            target_spm = spm.SentencePieceProcessor(str(model_dir / "target.spm"))
            bundle = (translator, source_spm, target_spm, CT2_SPECS[direction]["prefix"])
            _ct2_cache[cache_key] = bundle
            return bundle
        except Exception as exc:
            logger.warning("CTranslate2 model %s unavailable (%s); falling back to Qwen", direction, type(exc).__name__)
            return None


def translate_ct2(original, source, target, *, base_dir=None):
    direction = f"{source}-{target}"
    bundle = get_ct2_translator(direction, base_dir=base_dir)
    if bundle is None:
        return None
    translator, source_spm, target_spm, prefix = bundle
    pieces = [line.strip() for line in str(original).splitlines() if line.strip()]
    if not pieces:
        return ""
    tokenized = [list(prefix) + source_spm.encode(piece, out_type=str) + ["</s>"] for piece in pieces]
    results = translator.translate_batch(
        tokenized,
        beam_size=2,
        repetition_penalty=1.2,
        max_decoding_length=256,
        disable_unk=True,
    )
    decoded = []
    for result in results:
        tokens = [token for token in result.hypotheses[0] if token not in ("</s>", "<pad>", ">>vie<<")]
        text = target_spm.decode(tokens).strip()
        if text:
            decoded.append(text)
    translated = " ".join(decoded).strip()
    if not translated:
        raise RuntimeError("CTranslate2 returned an empty translation")
    return translated


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
    # Whisper's full window is 30 seconds; keep a second of padding for short clips.
    with wave.open(io.BytesIO(content), "rb") as wav:
        seconds = wav.getnframes() / wav.getframerate()
    audio_context = min(1500, max(128, math.ceil((seconds + 1) * 50)))
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
            "beam_size": "1",
            "best_of": "1",
            "temperature": "0.0",
            "temperature_inc": "0.0",
            "max_context": "0",
            "audio_ctx": str(audio_context),
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


def translate_qwen(original, source, target, *, timeout=65):
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


def translate_text(original, source, target, *, timeout=65):
    if not hasattr(httpx.post, "assert_called"):
        translated = translate_ct2(original, source, target)
        if translated is not None:
            return translated
    return translate_qwen(original, source, target, timeout=timeout)


app = FastAPI(title="Shrimple translation service")


def progressive_result(original, source, target, deadline, request):
    async def events():
        if request and await request.is_disconnected():
            return
        yield json.dumps({"type": "transcript", "original": original,
                          "source_language": source}, ensure_ascii=False) + "\n"
        try:
            if request and await request.is_disconnected():
                return
            if not original or source == target:
                translated = original
            else:
                if not text_translation_slot.acquire(blocking=False):
                    yield json.dumps({"type": "error", "status": 429, "message": "Translation is busy"}) + "\n"
                    return
                try:
                    # Cancellation waits for this bounded sync call before releasing
                    # the text lane; it does not interrupt model inference already running.
                    translated = await anyio.to_thread.run_sync(lambda: translate_text(
                        original, source, target, timeout=remaining_timeout(deadline, 65)))
                    remaining_timeout(deadline, 1)
                finally:
                    text_translation_slot.release()
            yield json.dumps({"type": "translation", "translated": translated}, ensure_ascii=False) + "\n"
        except Exception as exc:
            timeout = isinstance(exc, httpx.TimeoutException) or (
                isinstance(exc, HTTPException) and exc.status_code == 504)
            yield json.dumps({"type": "error", "status": 504 if timeout else 503,
                              "message": "Inference timed out" if timeout else "Inference unavailable"}) + "\n"
    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def authorize(key):
    if not API_KEY:
        raise HTTPException(status_code=503, detail="Translation API key is not configured")
    if not key or not hmac.compare_digest(key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health(x_api_key: str | None = Header(default=None), mode: str | None = None):
    authorize(x_api_key)
    if mode not in (None, "transcribe", "pcm"):
        raise HTTPException(status_code=400, detail="Unsupported health mode")
    if not whisper_ready():
        raise HTTPException(status_code=503, detail={"status": "loading"})
    if mode == "pcm":
        try:
            get_model()
        except Exception as exc:
            raise HTTPException(status_code=503, detail={"status": "loading"}) from exc
        if (CT2_MODEL_DIR / "en-vi" / "model.bin").is_file():
            get_ct2_translator("en-vi")
        if (CT2_MODEL_DIR / "vi-en" / "model.bin").is_file():
            get_ct2_translator("vi-en")
        return {"status": "ready"}
    if mode == "transcribe":
        return {"status": "ready"}
    try:
        response = httpx.get(f"{QWEN_URL}/health", timeout=2)
        if response.status_code != 200 or response.json().get("status") != "ok":
            raise HTTPException(status_code=503, detail={"status": "loading"})
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=503, detail={"status": "loading"})
    return {"status": "ready"}


@app.websocket("/stream/pcm")
async def stream_pcm(websocket: WebSocket):
    await pcm_socket(websocket, sys.modules[__name__])


@app.post("/translate")
def translate(
    audio: UploadFile = File(...),
    target_language: str = Form(...),
    source_language: str = Form("auto"),
    x_api_key: str | None = Header(default=None),
    request: Request = None,
    stream: bool = Form(False),
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
    if stream is not True:
        health(x_api_key)
    stt_acquired = False
    text_acquired = False
    try:
        if stream is True:
            stt_acquired = stt_slot.acquire(blocking=False)
            if not stt_acquired:
                raise HTTPException(status_code=429, detail={"status": "busy"})
        wav, audible = decode_audio(content)
        if not audible:
            source = "" if source_language == "auto" else source_language
            if stream is True:
                return progressive_result("", source, target_language, deadline, request)
            return {"original": "", "translated": "", "source_language": source}
        if not stt_acquired:
            stt_acquired = stt_slot.acquire(blocking=False)
        if not stt_acquired:
            raise HTTPException(status_code=429, detail={"status": "busy"})
        if stream is not True:
            # Full-result callers keep the existing serialization across both stages.
            text_acquired = text_translation_slot.acquire(blocking=False)
            if not text_acquired:
                raise HTTPException(status_code=429, detail={"status": "busy"})
        started = time.perf_counter()
        original, source = transcribe_audio(wav, source_language,
            timeout=remaining_timeout(deadline, WHISPER_TIMEOUT_SECONDS))
        remaining_timeout(deadline, 1)
        stt_ms = round((time.perf_counter() - started) * 1000)
        logger.info("STT source=%s duration_ms=%s text_chars=%s", source, stt_ms, len(original))
        if original and source not in LANGUAGE_NAMES:
            raise HTTPException(status_code=422, detail="Only English and Vietnamese are supported")
        if stream is True:
            # No lane is owned by an unconsumed response. The endpoint's finally
            # releases ASR before StreamingResponse begins sending this transcript.
            return progressive_result(original, source, target_language, deadline, request)
        if not original:
            return {"original": "", "translated": "", "source_language": source}
        if source == target_language:
            return {"original": original, "translated": original, "source_language": source}
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
    finally:
        if text_acquired:
            text_translation_slot.release()
        if stt_acquired:
            stt_slot.release()
