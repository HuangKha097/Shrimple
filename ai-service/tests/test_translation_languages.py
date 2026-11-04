"""Language contract regressions at HTTP/PCM entry points, before inference."""
import io
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
import app


class LanguageTests(unittest.TestCase):
    def test_checkpoint_routing_follows_source_in_both_directions(self):
        wav = io.BytesIO()
        with wave.open(wav, "wb") as audio:
            audio.setparams((1, 2, 16000, 0, "NONE", ""))
            audio.writeframes(bytes(32000))
        response = SimpleNamespace(raise_for_status=lambda: None,
                                   json=lambda: {"text": "hello world", "segments": []})
        with patch.object(app.httpx, "post", return_value=response) as post:
            for source, url in (("vi", app.PHOWHISPER_CPP_URL), ("en", app.WHISPER_CPP_URL)):
                self.assertEqual(app.transcribe_audio(wav.getvalue(), source), ("hello world", source))
                self.assertEqual(post.call_args.args[0], f"{url}/inference")
                self.assertEqual(post.call_args.kwargs["data"]["language"], source)
                self.assertEqual(post.call_args.kwargs["data"]["audio_ctx"], "0" if source == "vi" else "128")
                self.assertEqual(post.call_args.kwargs["data"]["no_timestamps"], "true" if source == "vi" else "false")

    def test_readiness_requires_both_checkpoints(self):
        healthy = SimpleNamespace(status_code=200, json=lambda: {"status": "ok"})
        loading = SimpleNamespace(status_code=503)
        with patch.object(app.httpx, "get", side_effect=[healthy, loading]) as get:
            self.assertFalse(app.whisper_ready())
            self.assertEqual([call.args[0] for call in get.call_args_list],
                             [f"{app.WHISPER_CPP_URL}/health", f"{app.PHOWHISPER_CPP_URL}/health"])

    def test_http_rejects_removed_languages_auto_and_same_language_before_models(self):
        with patch.object(app, "authorize"), patch.object(app, "health") as health:
            for source, target in (("zh", "vi"), ("en", "zh"), ("auto", "vi"), ("en", "en"), ("vi", "vi")):
                with self.subTest(source=source, target=target):
                    with self.assertRaises(HTTPException) as caught:
                        app.translate(UploadFile(io.BytesIO(b"unused")), target, source)
                    self.assertEqual(caught.exception.status_code, 400)
            health.assert_not_called()

    def test_pcm_rejects_unsupported_and_translating_same_language_before_models(self):
        with patch.object(app, "authorize"), patch.object(app, "whisper_ready") as ready:
            with TestClient(app.app) as client:
                for source, target in (("zh", "vi"), ("vi", "zh"), ("auto", "en"), ("en", "en")):
                    with self.subTest(source=source, target=target):
                        with client.websocket_connect("/stream/pcm") as socket:
                            socket.send_json(dict(sourceLanguage=source, targetLanguage=target))
                            event = socket.receive_json()
                            self.assertEqual((event["type"], event["status"]), ("error", 400))
            ready.assert_not_called()

    def test_pcm_self_transcription_reaches_readiness(self):
        # Same-language self notes must still pass language validation.
        with patch.object(app, "authorize"), patch.object(app, "whisper_ready", return_value=False) as ready:
            with TestClient(app.app) as client:
                for language in ("en", "vi"):
                    with client.websocket_connect("/stream/pcm") as socket:
                        socket.send_json(dict(sourceLanguage=language, targetLanguage=language, translate=False))
                        self.assertEqual(socket.receive_json()["status"], 503)
            self.assertEqual(ready.call_count, 2)


if __name__ == "__main__":
    unittest.main()
