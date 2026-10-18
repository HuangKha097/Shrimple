"""Local diagnostic using public/synthetic inputs only; does not change model config."""
import io
import json
import math
import re
import subprocess
import sys
import time
import wave

import httpx
import app


def emit(row):
    print(json.dumps(row, ensure_ascii=False), flush=True)


def wav_bytes(pcm, rate=16000):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return output.getvalue()


def synthesize(text):
    return subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        f"flite=text={text}:voice=slt", "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1",
    ], check=True, capture_output=True).stdout


def word_errors(expected, actual):
    a, b = (re.findall(r"\w+", text.lower()) for text in (expected, actual))
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        previous, row = row, [i]
        for j, y in enumerate(b, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j - 1] + (x != y)))
    return row[-1], len(a)


def asr(model):
    url = app.WHISPER_CPP_URL if model == "base" else "http://shrimple-whisper-quality-probe:8080"
    cases = [
        ("hear", "Can you hear me?", synthesize("Can you hear me")),
        ("happening", "What is happening?", synthesize("What is happening")),
        ("meeting", "The meeting starts at eight tonight.", synthesize("The meeting starts at eight tonight")),
    ]
    profiles = sys.argv[3].split(",") if len(sys.argv) > 3 else ("current", "timestamps", "beam3")
    for name, expected, pcm in cases:
        # Keep a VAD-like 320 ms silent tail in the final utterance.
        pcm += bytes(10240)
        seconds = len(pcm) / 32000
        content = wav_bytes(pcm)
        for profile in profiles:
            data = {
                "language": "en", "translate": "false", "response_format": "verbose_json",
                "no_timestamps": "true", "token_timestamps": "false", "suppress_nst": "true",
                "beam_size": "1", "best_of": "1", "temperature": "0.0", "temperature_inc": "0.0",
                "max_context": "0", "audio_ctx": str(min(1500, max(128, math.ceil((seconds + 1) * 50)))),
            }
            if profile == "timestamps":
                data["no_timestamps"] = "false"
            elif profile == "beam3":
                data.update(beam_size="3", no_timestamps="false")
            elif profile == "full_context":
                data.update(audio_ctx="0", no_timestamps="false")
            started = time.monotonic()
            try:
                response = httpx.post(url + "/inference", files={"file": ("synthetic.wav", content, "audio/wav")}, data=data, timeout=45)
                response.raise_for_status()
                text = response.json()["text"].strip()
                errors, words = word_errors(expected, text)
                emit({"stage": "asr", "model": model, "profile": profile, "case": name,
                      "audio_seconds": round(seconds, 3), "elapsed_ms": round((time.monotonic() - started) * 1000),
                      "expected": expected, "actual": text, "word_errors": errors, "reference_words": words})
            except Exception as exc:
                emit({"stage": "asr", "model": model, "profile": profile, "case": name, "error": type(exc).__name__})


def mt():
    models = ("ct2", "qwen")
    if len(sys.argv) > 2 and sys.argv[2] == "qwen17":
        app.QWEN_URL = "http://shrimple-qwen-quality-probe:8080"
        models = ("qwen17",)
    cases = [
        ("en", "vi", "Can you hear me?"),
        ("en", "vi", "What's happening?"),
        ("en", "vi", "The meeting starts at eight tonight."),
        ("en", "vi", "I can't hear you. Could you turn on your microphone?"),
        ("vi", "en", "Bạn đang làm gì vậy?"),
        ("vi", "en", "Bạn có nghe thấy tôi không?"),
        ("vi", "en", "Tối nay chúng ta họp lúc tám giờ, không phải hôm nay lúc tám giờ sáng."),
        ("vi", "en", "Mạng hơi yếu nên tiếng của bạn bị ngắt quãng."),
        ("vi", "en", "Bánh đang làm gì vậy?"),
    ]
    for source, target, original in cases:
        for model in models:
            started = time.monotonic()
            try:
                fn = app.translate_ct2 if model == "ct2" else app.translate_qwen
                result = fn(original, source, target)
                emit({"stage": "mt", "model": model, "source": source, "target": target,
                      "original": original, "translated": result,
                      "elapsed_ms": round((time.monotonic() - started) * 1000)})
            except Exception as exc:
                emit({"stage": "mt", "model": model, "source": source, "original": original, "error": type(exc).__name__})


if sys.argv[1] == "asr":
    asr(sys.argv[2])
elif sys.argv[1] == "mt":
    mt()
