import io
import shutil
import subprocess
import unittest
import wave
from array import array
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app


class TranslationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)
        self.key = patch.object(app, "API_KEY", "test-only-translation-key")
        self.key.start()
        self.addCleanup(self.key.stop)

    def request(self, *, source="en", target="vi", content=b"clip", mime="audio/webm", key="test-only-translation-key"):
        return self.client.post("/translate", headers={"x-api-key": key},
            files={"audio": ("clip", content, mime)},
            data={"source_language": source, "target_language": target})

    def test_missing_configuration_fails_closed(self):
        with patch.object(app, "API_KEY", ""), patch.object(app, "whisper_ready") as ready:
            self.assertEqual(self.client.get("/health").status_code, 503)
            self.assertEqual(self.request(key="").status_code, 503)
            ready.assert_not_called()

    def test_wrong_key_denied_before_inference(self):
        with patch.object(app, "whisper_ready") as ready:
            self.assertEqual(self.request(key="wrong").status_code, 401)
            self.assertEqual(self.client.get("/health").status_code, 401)
            ready.assert_not_called()

    def test_health_waits_for_both_models(self):
        headers = {"x-api-key": "test-only-translation-key"}
        with patch.object(app, "whisper_ready", return_value=False):
            response = self.client.get("/health", headers=headers)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"]["status"], "loading")
        with patch.object(app, "whisper_ready", return_value=True), patch.object(app.httpx, "get") as get:
            get.return_value = httpx.Response(503, json={"status": "loading"})
            self.assertEqual(self.client.get("/health", headers=headers).status_code, 503)
            get.return_value = httpx.Response(200, json={"status": "ok"})
            self.assertEqual(self.client.get("/health", headers=headers).json(), {"status": "ready"})

    def test_invalid_size_type_and_language_do_not_reach_models(self):
        with patch.object(app, "health") as health:
            self.assertEqual(self.request(content=b"").status_code, 413)
            self.assertEqual(self.request(content=b"x" * (app.MAX_AUDIO_BYTES + 1)).status_code, 413)
            self.assertEqual(self.request(mime="text/plain").status_code, 400)
            self.assertEqual(self.request(source="fr").status_code, 400)
            self.assertEqual(self.request(target="auto").status_code, 400)
            health.assert_not_called()

    def test_actual_decoder_failure_is_a_validation_error(self):
        with patch.object(app, "health"), patch.object(app.subprocess, "run",
                side_effect=subprocess.CalledProcessError(1, ["ffmpeg"])):
            self.assertEqual(self.request().status_code, 400)

    def test_decoding_keeps_pcm_and_wav_in_memory(self):
        pcm = array("h", [200, -200] * 16000).tobytes()
        with patch.object(app.subprocess, "run", return_value=SimpleNamespace(stdout=pcm)) as run:
            wav, audible = app.decode_audio(b"clip")
        self.assertTrue(audible)
        self.assertEqual(run.call_args.kwargs["input"], b"clip")
        with wave.open(io.BytesIO(wav), "rb") as decoded:
            self.assertEqual(decoded.getframerate(), 16000)
            self.assertEqual(decoded.getnchannels(), 1)
            self.assertEqual(decoded.readframes(decoded.getnframes()), pcm)

    def test_empty_or_more_than_15_seconds_is_rejected(self):
        for pcm in [b"", b"x", b"\0\0" * (16000 * 15 + 1)]:
            with self.subTest(size=len(pcm)), patch.object(app.subprocess, "run", return_value=SimpleNamespace(stdout=pcm)):
                with self.assertRaises(HTTPException) as raised:
                    app.decode_audio(b"clip")
                self.assertEqual(raised.exception.status_code, 400)

    def test_silence_does_not_reach_whisper_or_qwen(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", False)), \
                patch.object(app, "transcribe_audio") as stt, patch.object(app, "translate_text") as qwen:
            response = self.request()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["translated"], "")
            stt.assert_not_called()
            qwen.assert_not_called()

    def test_pipeline_returns_original_and_translation(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"normalized-wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")) as stt, \
                patch.object(app, "translate_text", return_value="Xin chào") as qwen:
            response = self.request(mime="audio/webm;codecs=opus")
            self.assertEqual(response.json(), {"original": "Hello", "translated": "Xin chào", "source_language": "en"})
            self.assertEqual(stt.call_args.args, (b"normalized-wav", "en"))
            self.assertEqual(qwen.call_args.args, ("Hello", "en", "vi"))

    def test_same_language_bypasses_qwen(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), patch.object(app, "translate_text") as qwen:
            self.assertEqual(self.request(target="en").json()["translated"], "Hello")
            qwen.assert_not_called()

    def test_unsupported_detected_language_is_422(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Bonjour", "")), patch.object(app, "translate_text") as qwen:
            self.assertEqual(self.request(source="auto").status_code, 422)
            qwen.assert_not_called()

    def test_whisper_gets_wav_source_language_and_no_translation(self):
        with patch.object(app.httpx, "post", return_value=httpx.Response(200,
                request=httpx.Request("POST", "http://whisper.test/inference"),
                json={"text": " Hello ", "language": "english"})) as post:
            self.assertEqual(app.transcribe_audio(b"wav", "auto"), ("Hello", "en"))
            payload = post.call_args.kwargs
            self.assertEqual(payload["files"]["file"], ("clip.wav", b"wav", "audio/wav"))
            self.assertEqual(payload["data"]["language"], "auto")
            self.assertEqual(payload["data"]["translate"], "false")

    def test_qwen_disables_thinking_and_only_requests_translation(self):
        response = httpx.Response(200, request=httpx.Request("POST", "http://qwen.test"),
            json={"choices": [{"finish_reason": "stop", "message": {"content": '"Xin chào"'}}]})
        with patch.object(app.httpx, "post", return_value=response) as post:
            self.assertEqual(app.translate_text("Hello", "en", "vi"), "Xin chào")
            payload = post.call_args.kwargs["json"]
            self.assertEqual(payload["chat_template_kwargs"], {"enable_thinking": False})
            self.assertIn("Return only the translation.", payload["messages"][0]["content"])
            self.assertEqual(payload["max_tokens"], 256)

    def test_qwen_rejects_reasoning_empty_or_truncated_output(self):
        for content, reason in [("<think>hidden</think>Hi", "stop"), ("", "stop"), ("partial", "length")]:
            response = httpx.Response(200, request=httpx.Request("POST", "http://qwen.test"),
                json={"choices": [{"finish_reason": reason, "message": {"content": content}}]})
            with self.subTest(content=content), patch.object(app.httpx, "post", return_value=response):
                with self.assertRaises(RuntimeError):
                    app.translate_text("Hello", "en", "vi")

    def test_stt_and_translation_share_the_remaining_budget(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app.time, "monotonic", side_effect=[0, 10, 72, 72, 78]), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")) as stt, \
                patch.object(app, "translate_text", return_value="Xin chào") as qwen:
            result = app.translate(SimpleNamespace(content_type="audio/webm", file=io.BytesIO(b"clip")),
                "vi", "en", "test-only-translation-key")
            self.assertEqual(result["translated"], "Xin chào")
            self.assertEqual(stt.call_args.kwargs["timeout"], 70)
            self.assertEqual(qwen.call_args.kwargs["timeout"], 8)

    def test_exhausted_budget_and_upstream_timeouts_are_504(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "remaining_timeout", side_effect=HTTPException(504, "Inference timed out")), \
                patch.object(app, "transcribe_audio") as stt:
            self.assertEqual(self.request().status_code, 504)
            stt.assert_not_called()
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", side_effect=httpx.ReadTimeout("test")):
            self.assertEqual(self.request().status_code, 504)


    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is not on PATH")
    def test_real_ffmpeg_decodes_six_second_audio_without_files(self):
        original = io.BytesIO()
        with wave.open(original, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(array("h", [200, -200] * 48000).tobytes())
        normalized, audible = app.decode_audio(original.getvalue())
        self.assertTrue(audible)
        with wave.open(io.BytesIO(normalized), "rb") as wav:
            self.assertEqual(wav.getnframes(), 6 * 16000)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is not on PATH")
    def test_real_ffmpeg_rejects_content_disguised_as_audio(self):
        with self.assertRaises(HTTPException) as raised:
            app.decode_audio(b"this is not audio")
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
