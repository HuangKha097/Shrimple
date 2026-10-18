"""Recognition regressions: real failure shapes, deliberate repetition and retry budgets."""
import io
import threading
import unittest
import wave
from unittest.mock import patch

import httpx
from fastapi import HTTPException

import app


def audio(seconds=2):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(bytes(round(seconds * 16000) * 2))
    return output.getvalue()


def response(text, **extra):
    return httpx.Response(200, request=httpx.Request("POST", "http://whisper.test/inference"),
                          json={"text": text, "language": "english", **extra})


class RecognitionTests(unittest.TestCase):
    def test_clean_recognition_has_one_fast_timestamped_request(self):
        content = audio()
        with patch.object(app.httpx, "post", return_value=response("Can you hear me?")) as post:
            self.assertEqual(app.transcribe_audio(content, "en"), ("Can you hear me?", "en"))
        self.assertEqual(post.call_count, 1)
        data = post.call_args.kwargs["data"]
        self.assertEqual((data["no_timestamps"], data["token_timestamps"], data["beam_size"]),
                         ("false", "false", "1"))
        self.assertEqual(post.call_args.kwargs["files"]["file"][1], content)

    def test_long_english_or_vietnamese_loop_retries_same_audio_once_before_returning(self):
        for language, phrase in [("en", "Can you hear me? "), ("vi", "Bạn đang làm gì vậy? ")]:
            with self.subTest(language=language), patch.object(app.httpx, "post", side_effect=[
                    response(phrase * 44), response(phrase.strip())]) as post:
                content = audio()
                self.assertEqual(app.transcribe_audio(content, language), (phrase.strip(), language))
                first, retry = [call.kwargs for call in post.call_args_list]
                self.assertEqual(first["data"]["beam_size"], "1")
                self.assertEqual((retry["data"]["audio_ctx"], retry["data"]["beam_size"]), ("0", "3"))
                self.assertEqual(first["files"], retry["files"])
                self.assertEqual(first["data"]["language"], retry["data"]["language"])
                self.assertLessEqual(retry["timeout"].read, first["timeout"].read)

    def test_partial_never_retries_or_exposes_a_loop(self):
        with patch.object(app.httpx, "post", return_value=response("Can you hear me? " * 44)) as post:
            with self.assertRaises(HTTPException) as raised:
                app.transcribe_audio(audio(), "en", retry_on_repetition=False)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(post.call_count, 1)

    def test_failed_or_empty_retry_does_not_return_a_trimmed_guess(self):
        for retry_text in ("Can you hear me? " * 44, ""):
            with self.subTest(retry=bool(retry_text)), patch.object(app.httpx, "post", side_effect=[
                    response("Can you hear me? " * 44), response(retry_text)]) as post:
                with self.assertRaises(HTTPException) as raised:
                    app.transcribe_audio(audio(), "en")
                self.assertEqual(raised.exception.status_code, 422)
                self.assertNotIn("Can you hear me", raised.exception.detail)
                self.assertEqual(post.call_count, 2)

    def test_short_emphasis_and_real_repeated_phrases_are_preserved(self):
        for original, seconds, segments in [
            ("No, no, that's not what I meant.", 2, []),
            ("Can you hear me? Can you hear me?", 4, [
                {"text": "Can you hear me?", "start": 0, "end": 1.4},
                {"text": "Can you hear me?", "start": 1.6, "end": 3.2}]),
            ("Bạn đang làm gì vậy? " * 4, 8, []),
            ("Rất rất vui được gặp bạn.", 2, []),
        ]:
            with self.subTest(original=original), patch.object(app.httpx, "post",
                    return_value=response(original, segments=segments)) as post:
                self.assertEqual(app.transcribe_audio(audio(seconds), "vi")[0], original.strip())
                self.assertEqual(post.call_count, 1)

    def test_duplicate_overlap_or_invented_tail_retries_instead_of_concatenating(self):
        for segments in [
            [{"text": "Can you hear me?", "start": 0, "end": 1.7},
             {"text": "Can you hear me?", "start": 1.6, "end": 1.9}],
            [{"text": "The meeting starts at 8pm tonight.", "start": 0, "end": 2},
             {"text": "I'm going to start at 8pm tonight.", "start": 2, "end": 4}],
            [{"text": "This text was never spoken.", "start": 3, "end": 5}],
        ]:
            original = " ".join(segment["text"] for segment in segments)
            with self.subTest(segments=segments), patch.object(app.httpx, "post", side_effect=[
                    response(original, segments=segments), response("Clean final")]) as post:
                self.assertEqual(app.transcribe_audio(audio(2.415), "en"), ("Clean final", "en"))
                self.assertEqual(post.call_count, 2)

    def test_retry_cannot_reset_or_exceed_the_original_budget(self):
        with patch.object(app.time, "monotonic", side_effect=[0, 0.1, 1, 1.2, 1.8]), \
                patch.object(app.httpx, "post", side_effect=[response("Can you hear me? " * 44),
                                                           response("Recovered")]) as post:
            self.assertEqual(app.transcribe_audio(audio(), "en", timeout=2), ("Recovered", "en"))
        self.assertAlmostEqual(post.call_args_list[0].kwargs["timeout"].read, 1.9)
        self.assertAlmostEqual(post.call_args_list[1].kwargs["timeout"].read, 0.8)
        with patch.object(app.time, "monotonic", side_effect=[0, 0.1, 2.1]), \
                patch.object(app.httpx, "post", return_value=response("Can you hear me? " * 44)) as post:
            with self.assertRaises(HTTPException) as raised:
                app.transcribe_audio(audio(), "en", timeout=2)
        self.assertEqual(raised.exception.status_code, 504)
        self.assertEqual(post.call_count, 1)

    def test_closed_stream_never_starts_a_retry_after_inflight_inference(self):
        cancelled = threading.Event()
        def finished_after_close(*_args, **_kwargs):
            cancelled.set()
            return response("Can you hear me? " * 44)
        with patch.object(app.httpx, "post", side_effect=finished_after_close) as post:
            self.assertIsNone(app.transcribe_audio(audio(), "en", cancelled=cancelled))
            self.assertEqual(post.call_count, 1)
            post.reset_mock()
            self.assertIsNone(app.transcribe_audio(audio(), "en", cancelled=cancelled))
            post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
