import io
import shutil
import subprocess
import unittest
import wave
import json
import socket
import threading
import time
from contextlib import contextmanager
from array import array
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import uvicorn
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app


@contextmanager
def live_service():
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    server = uvicorn.Server(uvicorn.Config(app.app, log_level="critical", lifespan="off"))
    worker = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    worker.start()
    deadline = time.monotonic() + 5
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("Test HTTP server did not start")
        time.sleep(0.01)
    try:
        yield f"http://127.0.0.1:{listener.getsockname()[1]}"
    finally:
        server.should_exit = True
        worker.join(5)
        listener.close()


def slot_is_free(slot):
    acquired = slot.acquire(blocking=False)
    if acquired:
        slot.release()
    return acquired


def wait_for_free_slot(slot=None):
    slot = app.stt_slot if slot is None else slot
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if slot_is_free(slot):
            return True
        time.sleep(0.01)
    return False


class TranslationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)
        self.key = patch.object(app, "API_KEY", "test-only-translation-key")
        self.key.start()
        self.addCleanup(self.key.stop)

    def tearDown(self):
        self.assertTrue(wait_for_free_slot(app.stt_slot), "STT lane was not released")
        self.assertTrue(wait_for_free_slot(app.text_translation_slot), "Translation lane was not released")

    def request(self, *, source="en", target="vi", content=b"clip", mime="audio/webm", key="test-only-translation-key", stream=False):
        return self.client.post("/translate", headers={"x-api-key": key},
            files={"audio": ("clip", content, mime)},
            data={"source_language": source, "target_language": target, "stream": str(stream).lower()})

    def test_stream_preserves_transcript_when_translation_fails_and_reuses_slot(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), \
                patch.object(app, "translate_text", side_effect=RuntimeError("private model output")):
            response = self.request(stream=True)
            self.assertEqual(response.status_code, 200)
            events = [json.loads(line) for line in response.iter_lines()]
            self.assertEqual(events[0], {"type": "transcript", "original": "Hello", "source_language": "en"})
            self.assertEqual(events[1], {"type": "error", "status": 503, "message": "Inference unavailable"})
            self.assertTrue(wait_for_free_slot())
            self.assertEqual(self.request(target="en").json()["translated"], "Hello")

    def test_stream_same_language_bypasses_translation_and_timeout_preserves_original(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), \
                patch.object(app, "translate_text", side_effect=httpx.ReadTimeout("private timeout")) as qwen:
            events = [json.loads(line) for line in self.request(stream=True, target="en").iter_lines()]
            self.assertEqual(events[-1], {"type": "translation", "translated": "Hello"})
            qwen.assert_not_called()
            events = [json.loads(line) for line in self.request(stream=True).iter_lines()]
            self.assertEqual(events[0]["original"], "Hello")
            self.assertEqual(events[-1], {"type": "error", "status": 504, "message": "Inference timed out"})
            self.assertTrue(wait_for_free_slot())

    def test_stream_silence_auth_busy_and_stt_timeout_remain_safe(self):
        with patch.object(app, "health") as health, patch.object(app, "decode_audio", return_value=(b"wav", False)), \
                patch.object(app, "transcribe_audio") as stt, patch.object(app, "translate_text") as qwen:
            self.assertEqual(self.request(stream=True, key="wrong").status_code, 401)
            health.assert_not_called()
            events = [json.loads(line) for line in self.request(stream=True, source="auto").iter_lines()]
            self.assertEqual(events, [{"type": "transcript", "original": "", "source_language": ""},
                                      {"type": "translation", "translated": ""}])
            stt.assert_not_called()
            qwen.assert_not_called()
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", side_effect=httpx.ReadTimeout("private timeout")):
            app.inference_slot.acquire()
            try:
                self.assertEqual(self.request(stream=True).status_code, 429)
            finally:
                app.inference_slot.release()
            self.assertEqual(self.request(stream=True).status_code, 504)
            self.assertTrue(wait_for_free_slot())

    def test_real_http_next_original_continues_while_previous_translation_is_pending(self):
        started, release = threading.Event(), threading.Event()
        def delayed_translation(*_args, **_kwargs):
            started.set()
            if not release.wait(5):
                raise RuntimeError("Test translation gate expired")
            return "Xin chào"
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", side_effect=[("Hello", "en"), ("Next sentence", "en")]) as stt, \
                patch.object(app, "translate_text", side_effect=delayed_translation) as qwen, live_service() as url:
            try:
                with httpx.stream("POST", f"{url}/translate", headers={"x-api-key": "test-only-translation-key"},
                        files={"audio": ("clip.webm", b"clip", "audio/webm")},
                        data={"source_language": "en", "target_language": "vi", "stream": "true"}, timeout=5) as response:
                    lines = response.iter_lines()
                    self.assertEqual(json.loads(next(lines))["type"], "transcript")
                    self.assertFalse(release.is_set())
                    self.assertTrue(started.wait(2))
                    self.assertTrue(slot_is_free(app.stt_slot))
                    self.assertFalse(slot_is_free(app.text_translation_slot))
                    with httpx.stream("POST", f"{url}/translate", headers={"x-api-key": "test-only-translation-key"},
                            files={"audio": ("clip.webm", b"second-clip", "audio/webm")},
                            data={"source_language": "en", "target_language": "vi", "stream": "true"}, timeout=5) as second:
                        second_lines = second.iter_lines()
                        self.assertEqual(json.loads(next(second_lines)), {
                            "type": "transcript", "original": "Next sentence", "source_language": "en"})
                        second_error = json.loads(next(second_lines))
                        self.assertEqual(second_error["type"], "error")
                        self.assertEqual(second_error["status"], 429)
                        self.assertEqual(list(second_lines), [])
                    self.assertFalse(release.is_set())
                    self.assertEqual(stt.call_count, 2)
                    self.assertEqual(qwen.call_count, 1)
                    self.assertEqual(self.request().status_code, 429)
                    release.set()
                    self.assertEqual(json.loads(next(lines)), {"type": "translation", "translated": "Xin chào"})
                    self.assertEqual(list(lines), [])
            finally:
                release.set()
            self.assertTrue(wait_for_free_slot())

    def test_real_http_disconnect_during_translation_keeps_only_text_lane_until_worker_finishes(self):
        started, release = threading.Event(), threading.Event()
        def delayed_translation(*_args, **_kwargs):
            started.set()
            release.wait(5)
            return "Xin chào"
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), \
                patch.object(app, "translate_text", side_effect=delayed_translation), live_service() as url:
            try:
                with httpx.stream("POST", f"{url}/translate", headers={"x-api-key": "test-only-translation-key"},
                        files={"audio": ("clip.webm", b"clip", "audio/webm")},
                        data={"source_language": "en", "target_language": "vi", "stream": "true"}, timeout=5) as response:
                    self.assertEqual(json.loads(next(response.iter_lines()))["type"], "transcript")
                    self.assertTrue(started.wait(2))
                self.assertTrue(slot_is_free(app.stt_slot))
                self.assertFalse(slot_is_free(app.text_translation_slot))
            finally:
                release.set()
            self.assertTrue(wait_for_free_slot(app.text_translation_slot))

    def test_real_http_disconnect_before_first_event_releases_slot_after_stt(self):
        started, release = threading.Event(), threading.Event()
        def delayed_stt(*_args, **_kwargs):
            started.set()
            release.wait(5)
            return "Hello", "en"
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", side_effect=delayed_stt), \
                patch.object(app, "translate_text") as qwen, live_service() as url:
            try:
                with self.assertRaises(httpx.ReadTimeout):
                    httpx.post(f"{url}/translate", headers={"x-api-key": "test-only-translation-key"},
                        files={"audio": ("clip.webm", b"clip", "audio/webm")},
                        data={"source_language": "en", "target_language": "vi", "stream": "true"}, timeout=0.2)
                self.assertTrue(started.is_set())
                self.assertFalse(slot_is_free(app.stt_slot))
            finally:
                release.set()
            self.assertTrue(wait_for_free_slot())
            qwen.assert_not_called()

    def test_unconsumed_direct_stream_response_holds_neither_lane(self):
        with patch.object(app, "health") as health, patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), \
                patch.object(app, "translate_text") as qwen:
            response = app.translate(SimpleNamespace(content_type="audio/webm", file=io.BytesIO(b"clip")),
                "vi", "en", "test-only-translation-key", None, True)
            self.assertEqual(response.media_type, "application/x-ndjson")
            self.assertTrue(slot_is_free(app.stt_slot))
            self.assertTrue(slot_is_free(app.text_translation_slot))
            qwen.assert_not_called()
            health.assert_not_called()

    def test_busy_text_lane_preserves_stream_original_and_legacy_rejects_before_stt(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")) as stt, \
                patch.object(app, "translate_text") as qwen:
            app.text_translation_slot.acquire()
            try:
                self.assertEqual(self.request().status_code, 429)
                stt.assert_not_called()
                self.assertTrue(slot_is_free(app.stt_slot))
                response = self.request(stream=True)
                self.assertEqual(response.status_code, 200)
                events = [json.loads(line) for line in response.iter_lines()]
                self.assertEqual(events[0]["original"], "Hello")
                self.assertEqual(events[1]["status"], 429)
                self.assertEqual(stt.call_count, 1)
                qwen.assert_not_called()
            finally:
                app.text_translation_slot.release()
            self.assertEqual(self.request(target="en").json()["translated"], "Hello")

    def test_stream_busy_stt_lane_rejects_before_decoding_and_does_not_hold_text_lane(self):
        with patch.object(app, "decode_audio") as decode, patch.object(app, "transcribe_audio") as stt:
            app.stt_slot.acquire()
            try:
                self.assertEqual(self.request(stream=True).status_code, 429)
                decode.assert_not_called()
                stt.assert_not_called()
                self.assertTrue(slot_is_free(app.text_translation_slot))
            finally:
                app.stt_slot.release()

    def test_stream_does_not_wait_for_combined_model_health(self):
        with patch.object(app, "health", side_effect=RuntimeError("Text service unavailable")) as health, \
                patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Hello", "en")), \
                patch.object(app, "translate_text", side_effect=RuntimeError("Text service unavailable")):
            events = [json.loads(line) for line in self.request(stream=True).iter_lines()]
            self.assertEqual(events[0]["original"], "Hello")
            self.assertEqual(events[1]["status"], 503)
            health.assert_not_called()

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

    def test_transcribe_health_stays_ready_when_text_model_is_down(self):
        headers = {"x-api-key": "test-only-translation-key"}
        with patch.object(app, "whisper_ready", return_value=True) as ready, \
                patch.object(app.httpx, "get", return_value=httpx.Response(503, json={"status": "loading"})) as get:
            self.assertEqual(self.client.get("/health?mode=transcribe", headers=headers).json(), {"status": "ready"})
            get.assert_not_called()
            self.assertEqual(self.client.get("/health", headers=headers).status_code, 503)
            get.reset_mock()
            self.assertEqual(self.client.get("/health?mode=invalid", headers=headers).status_code, 400)
            get.assert_not_called()
            self.assertEqual(ready.call_count, 2)
        with patch.object(app, "whisper_ready", return_value=False):
            self.assertEqual(self.client.get("/health?mode=transcribe", headers=headers).status_code, 503)

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

    def test_repeated_recognition_is_never_sent_to_translation_or_http_stream(self):
        normalized = io.BytesIO()
        with wave.open(normalized, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(bytes(64000))
        for stream in (False, True):
            response = httpx.Response(200, request=httpx.Request("POST", "http://whisper.test/inference"),
                                     json={"text": "Can you hear me? " * 44, "language": "english"})
            with self.subTest(stream=stream), patch.object(app, "health"), \
                    patch.object(app, "decode_audio", return_value=(normalized.getvalue(), True)), \
                    patch.object(app.httpx, "post", return_value=response) as post, \
                    patch.object(app, "translate_text") as translate:
                result = self.request(stream=stream)
                self.assertEqual(result.status_code, 422)
                self.assertNotIn("Can you hear me", result.text)
                self.assertEqual(post.call_count, 2)
                translate.assert_not_called()

    def test_busy_clip_is_not_queued_and_timeout_releases_the_slot(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio") as stt:
            self.assertTrue(app.inference_slot.acquire(blocking=False))
            try:
                response = self.request(target="en")
                self.assertEqual(response.status_code, 429)
                self.assertEqual(response.json()["detail"]["status"], "busy")
                stt.assert_not_called()
            finally:
                app.inference_slot.release()
            stt.side_effect = httpx.ReadTimeout("test-only timeout")
            self.assertEqual(self.request(target="en").status_code, 504)
            stt.side_effect = None
            stt.return_value = ("Hello", "en")
            self.assertEqual(self.request(target="en").status_code, 200)

    def test_unsupported_detected_language_is_422(self):
        with patch.object(app, "health"), patch.object(app, "decode_audio", return_value=(b"wav", True)), \
                patch.object(app, "transcribe_audio", return_value=("Bonjour", "")), patch.object(app, "translate_text") as qwen:
            self.assertEqual(self.request(source="auto").status_code, 422)
            qwen.assert_not_called()

    def test_whisper_gets_wav_source_language_and_no_translation(self):
        normalized = io.BytesIO()
        with wave.open(normalized, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b"\0\0" * 6 * 16000)
        content = normalized.getvalue()
        with patch.object(app.httpx, "post", return_value=httpx.Response(200,
                request=httpx.Request("POST", "http://whisper.test/inference"),
                json={"text": " Hello ", "language": "english"})) as post:
            self.assertEqual(app.transcribe_audio(content, "auto"), ("Hello", "en"))
            payload = post.call_args.kwargs
            self.assertEqual(payload["files"]["file"], ("clip.wav", content, "audio/wav"))
            self.assertEqual(payload["data"]["language"], "auto")
            self.assertEqual(payload["data"]["translate"], "false")
            self.assertEqual(payload["data"]["audio_ctx"], "350")

    def test_longest_allowed_clip_is_not_truncated_by_audio_context(self):
        original = io.BytesIO()
        with wave.open(original, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b"\0\0" * 15 * 16000)
        content = original.getvalue()
        with patch.object(app.httpx, "post", return_value=httpx.Response(200,
                request=httpx.Request("POST", "http://whisper.test/inference"),
                json={"text": "end of clip", "language": "vi"})) as post:
            self.assertEqual(app.transcribe_audio(content, "vi"), ("end of clip", "vi"))
        payload = post.call_args.kwargs
        self.assertEqual(payload["files"]["file"][1], content)
        self.assertGreaterEqual(int(payload["data"]["audio_ctx"]) / 50, 15)
        self.assertLess(int(payload["data"]["audio_ctx"]), 1500)

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

    def test_compute_profile_splits_50_50_across_cpu_and_gpu_or_falls_back_to_cpu_only(self):
        gpu_profile = app.compute_profile(gpu_available=True, cpu_count=8)
        self.assertEqual(gpu_profile["mode"], "cpu_gpu_50_50")
        self.assertEqual((gpu_profile["asr_device"], gpu_profile["mt_device"], gpu_profile["vad_device"]), ("gpu", "cpu", "cpu"))
        self.assertEqual((gpu_profile["asr_share"], gpu_profile["cpu_share"]), (0.5, 0.5))
        self.assertEqual((gpu_profile["asr_threads"], gpu_profile["mt_threads"]), (4, 4))

        cpu_profile = app.compute_profile(gpu_available=False, cpu_count=4)
        self.assertEqual(cpu_profile["mode"], "cpu_only_50_50")
        self.assertEqual((cpu_profile["asr_device"], cpu_profile["mt_device"], cpu_profile["vad_device"]), ("cpu", "cpu", "cpu"))
        self.assertEqual((cpu_profile["asr_share"], cpu_profile["cpu_share"]), (0.5, 0.5))
        self.assertEqual((cpu_profile["asr_threads"], cpu_profile["mt_threads"]), (2, 2))

    def test_ct2_bidirectional_translation_uses_marian_prefix_and_eos(self):
        recorded = []
        fake_translator = SimpleNamespace(
            translate_batch=lambda tokens, **kwargs: recorded.append((tokens, kwargs)) or [
                SimpleNamespace(hypotheses=[["▁Xin", "▁chào", "</s>"]])
            ]
        )
        fake_src = SimpleNamespace(encode=lambda text, out_type=str: ["▁Hello"])
        fake_tgt = SimpleNamespace(decode=lambda tokens: "Xin chào" if tokens == ["▁Xin", "▁chào"] else "")
        with patch.object(app, "get_ct2_translator", return_value=(fake_translator, fake_src, fake_tgt, [">>vie<<"])):
            self.assertEqual(app.translate_ct2("Hello", "en", "vi"), "Xin chào")
        self.assertEqual(recorded[0][0], [[">>vie<<", "▁Hello", "</s>"]])
        self.assertEqual(recorded[0][1]["beam_size"], 2)


if __name__ == "__main__":
    unittest.main()

