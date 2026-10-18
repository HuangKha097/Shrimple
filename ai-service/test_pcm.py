import asyncio
import io
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

import numpy as np
import httpx
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketDenialResponse
from starlette.websockets import WebSocketDisconnect

import app
import pcm_stream
import pcm_vad
from pcm_stream import PcmPipeline
from pcm_vad import SpeechSnapshot

PACKET = b"\0" * pcm_vad.PACKET_BYTES
KEY = "test-only-translation-key"


class ScriptVad:
    def __init__(self, probabilities):
        self.probabilities = iter(probabilities)

    def probability(self, _frame):
        return next(self.probabilities, 0)


class ScriptSegmenter:
    def __init__(self, snapshots=()):
        self.snapshots = iter(snapshots)

    def feed(self, _packet):
        return next(self.snapshots, [])


class RecordingSocket:
    def __init__(self):
        self.events = []
        self.queue = asyncio.Queue()

    async def send_text(self, payload):
        import json
        event = json.loads(payload)
        self.events.append(event)
        self.queue.put_nowait(event)

    async def next(self, kind, utterance=None):
        async def find():
            while True:
                event = await self.queue.get()
                if event["type"] == kind and (utterance is None or event.get("utteranceId") == utterance):
                    return event
        return await asyncio.wait_for(find(), 3)


def backend():
    return SimpleNamespace(stt_slot=threading.Lock(), text_translation_slot=threading.Lock(),
        WHISPER_TIMEOUT_SECONDS=70,
        transcribe_audio=lambda _wav, source, **_kwargs: ("Hello", source),
        translate_text=lambda *_args, **_kwargs: "Xin chào")


async def wait_thread_event(event):
    if not await asyncio.to_thread(event.wait, 3):
        raise AssertionError("Inference worker did not reach test barrier")


class VadTests(unittest.TestCase):
    def test_pinned_real_model_smoke_and_independent_stream_state(self):
        model = pcm_vad.get_model()
        first, second = pcm_vad.SileroStream(model), pcm_vad.SileroStream(model)
        self.assertIs(first.model, second.model)
        probability = first.probability(b"\0" * pcm_vad.FRAME_BYTES)
        self.assertLess(probability, 0.1)
        self.assertTrue(np.any(first.state != 0))
        self.assertFalse(np.any(second.state != 0))
        self.assertFalse(np.shares_memory(first.state, second.state))
        self.assertFalse(np.shares_memory(first.context, second.context))

    def test_real_voice_is_detected_but_zeros_do_not_form_an_utterance(self):
        with wave.open(str(Path(__file__).parent / "testdata" / "jfk-2s.wav"), "rb") as wav:
            self.assertEqual((wav.getframerate(), wav.getnchannels(), wav.getsampwidth()), (16000, 1, 2))
            voice = wav.readframes(wav.getnframes())
        segmenter = pcm_vad.SpeechSegmenter()
        events = []
        content = voice + b"\0" * 16000
        content += b"\0" * (-len(content) % pcm_vad.PACKET_BYTES)
        for offset in range(0, len(content), pcm_vad.PACKET_BYTES):
            events.extend(segmenter.feed(content[offset:offset + pcm_vad.PACKET_BYTES]))
        self.assertTrue(any(event.is_final and event.pcm for event in events))
        quiet = pcm_vad.SpeechSegmenter()
        self.assertFalse([event for _ in range(32) for event in quiet.feed(PACKET)])

    def test_checksum_and_graph_signature_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corrupt.onnx"
            path.write_bytes(b"incorrect model")
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                pcm_vad.SileroModel(path)
        invalid = SimpleNamespace(get_inputs=lambda: [], get_outputs=lambda: [])
        with patch.object(pcm_vad.ort, "InferenceSession", return_value=invalid):
            with self.assertRaisesRegex(RuntimeError, "inputs"):
                pcm_vad.SileroModel()

    def test_frame_boundaries_preroll_partial_and_silence_endpoint(self):
        probabilities = [0] * 12 + [0.9] * 20 + [0] * 12
        segmenter = pcm_vad.SpeechSegmenter(ScriptVad(probabilities))
        frames = [int(index).to_bytes(2, "little") * 512 for index in range(44)]
        events = []
        for offset in range(0, len(frames), 4):
            events.extend(segmenter.feed(b"".join(frames[offset:offset + 4])))
        self.assertEqual([event.is_final for event in events], [False, True])
        partial, final = events
        self.assertEqual(partial.utterance, final.utterance)
        self.assertEqual(partial.pcm[:1024], frames[4])  # Last eight of twelve quiet frames.
        self.assertEqual(len(partial.pcm), (8 + 19) * 1024)
        self.assertEqual(len(final.pcm), (8 + 20 + 10) * 1024)
        self.assertLessEqual(len(segmenter.pre_roll), 8)
        self.assertEqual(segmenter.frames, [])

    def test_hysteresis_and_eight_second_maximum_bound_audio(self):
        segmenter = pcm_vad.SpeechSegmenter(ScriptVad([0.9] + [0.4] * 503))
        events = [event for _ in range(126) for event in segmenter.feed(PACKET)]
        finals = [event for event in events if event.is_final]
        self.assertEqual([event.utterance for event in finals], [1, 2])
        self.assertEqual([len(event.pcm) for event in finals], [250 * 1024] * 2)
        self.assertLess(len(segmenter.frames), 250)

    def test_pcm_wav_preserves_endianness_and_never_runs_ffmpeg(self):
        pcm = b"\x01\x00\xff\x7f\x00\x80" * 100
        with patch.object(app.subprocess, "run", side_effect=AssertionError("PCM invoked FFmpeg")):
            wrapped = pcm_vad.pcm_wav(pcm)
        with wave.open(io.BytesIO(wrapped), "rb") as wav:
            self.assertEqual(wav.getparams()[:3], (1, 2, 16000))
            self.assertEqual(wav.readframes(wav.getnframes()), pcm)

    def test_segmenter_rejects_wrong_packet_sizes(self):
        for size in (0, 1024, 4095, 4097):
            with self.subTest(size=size), self.assertRaises(ValueError):
                pcm_vad.SpeechSegmenter(ScriptVad([])).feed(b"\0" * size)


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def make_pipeline(self, snapshots):
        socket, engine = RecordingSocket(), backend()
        pipeline = PcmPipeline(socket, engine, "en", "vi", ScriptSegmenter(snapshots))
        self.addAsyncCleanup(pipeline.close)
        return pipeline, socket, engine

    async def test_partial_then_final_update_same_utterance_revision_and_translate_final_only(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET * 2, True)]])
        calls = []
        engine.translate_text = lambda text, *_args, **_kwargs: calls.append(text) or "Xin chào"
        pipeline.start()
        with patch.object(app.subprocess, "run", side_effect=AssertionError("PCM invoked FFmpeg")), \
                patch.object(app, "decode_audio", side_effect=AssertionError("PCM decoded compressed audio")):
            await pipeline.feed(PACKET)
            partial = await socket.next("transcript")
            self.assertFalse(partial["isFinal"])
            self.assertEqual(calls, [])
            await pipeline.feed(PACKET)
            final = await socket.next("transcript")
            translated = await socket.next("translation")
        self.assertEqual((partial["utteranceId"], final["utteranceId"]), ("u1", "u1"))
        self.assertEqual((partial["revision"], final["revision"], translated["revision"]), (1, 2, 2))
        self.assertTrue(final["isFinal"])
        self.assertEqual((final["sourceLanguage"], final["targetLanguage"]), ("en", "vi"))
        self.assertEqual(calls, ["Hello"])

    async def test_next_original_arrives_while_previous_translation_is_blocked(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, True)], [SpeechSnapshot(2, PACKET, True)]])
        entered, release = threading.Event(), threading.Event()
        def translate(*_args, **_kwargs):
            entered.set()
            release.wait(3)
            return "Xin chào"
        engine.translate_text = translate
        pipeline.start()
        try:
            await pipeline.feed(PACKET)
            await socket.next("transcript", "u1")
            await wait_thread_event(entered)
            await pipeline.feed(PACKET)
            second = await socket.next("transcript", "u2")
            self.assertTrue(second["isFinal"])
            self.assertFalse(any(event["type"] == "translation" for event in socket.events))
        finally:
            release.set()
        translated = await socket.next("translation", "u1")
        self.assertEqual(translated["revision"], 1)

    async def test_empty_recognition_does_not_emit_invalid_note_and_settles_prior_partial(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET, True)],
            [SpeechSnapshot(2, PACKET, False)], [SpeechSnapshot(2, PACKET, True)]])
        results = iter([("Hello", "en"), ("  ", "en"), ("", "en"), ("", "en")])
        completed = threading.Event()
        def recognize(*_args, **_kwargs):
            result = next(results)
            if result[0] == "":
                completed.set()
            return result
        engine.transcribe_audio = recognize
        pipeline.start()
        await pipeline.feed(PACKET)
        await socket.next("transcript", "u1")
        await pipeline.feed(PACKET)
        error = await socket.next("error", "u1")
        self.assertEqual((error["status"], error["revision"]), (422, 1))
        await pipeline.feed(PACKET)
        await wait_thread_event(completed)
        completed.clear()
        await pipeline.feed(PACKET)
        await wait_thread_event(completed)
        self.assertEqual(len(socket.events), 2)
        self.assertFalse(any(event.get("utteranceId") == "u2" for event in socket.events))

    async def test_rejected_partial_waits_for_a_clean_final_without_retry_or_bad_notes(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET * 2, True)]])
        engine.transcribe_audio = app.transcribe_audio
        calls = []
        engine.translate_text = lambda text, *_args, **_kwargs: calls.append(text) or "Xin chào"
        def result(text):
            return httpx.Response(200, request=httpx.Request("POST", "http://whisper.test/inference"),
                                  json={"text": text, "language": "english"})
        with patch.object(app.httpx, "post", side_effect=[result("Can you hear me? " * 44), result("Hello")]) as post:
            pipeline.start()
            await pipeline.feed(PACKET)
            await socket.next("status")
            self.assertEqual(post.call_count, 1)
            self.assertFalse(any(event["type"] == "transcript" for event in socket.events))
            await pipeline.feed(PACKET)
            final = await socket.next("transcript")
            await socket.next("translation")
        self.assertTrue(final["isFinal"])
        self.assertEqual(final["original"], "Hello")
        self.assertEqual(calls, ["Hello"])

    async def test_bad_final_settles_one_utterance_and_next_speech_continues(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, True)], [SpeechSnapshot(2, PACKET, True)]])
        engine.transcribe_audio = app.transcribe_audio
        calls = []
        engine.translate_text = lambda text, *_args, **_kwargs: calls.append(text) or "Xin chào"
        responses = [httpx.Response(200, request=httpx.Request("POST", "http://whisper.test/inference"),
                                   json={"text": text, "language": "english"})
                     for text in ["Can you hear me? " * 44, "Can you hear me? " * 44, "Hello"]]
        with patch.object(app.httpx, "post", side_effect=responses) as post:
            pipeline.start()
            await pipeline.feed(PACKET)
            error = await socket.next("error", "u1")
            self.assertEqual((error["status"], error["revision"]), (422, 0))
            self.assertEqual(post.call_count, 2)
            self.assertEqual(calls, [])
            self.assertFalse(any(event["type"] == "transcript" for event in socket.events))
            await pipeline.feed(PACKET)
            final = await socket.next("transcript", "u2")
            await socket.next("translation", "u2")
        self.assertEqual(final["original"], "Hello")
        self.assertEqual(calls, ["Hello"])
        self.assertNotIn("Can you hear me", str(socket.events))
        self.assertFalse(engine.stt_slot.locked())

    async def test_final_queue_overload_reports_specific_utterance(self):
        pipeline, socket, _ = await self.make_pipeline([[SpeechSnapshot(index, PACKET, True)] for index in range(1, 5)])
        # No worker consumes queued work, so the fourth final crosses the fixed cap.
        for _ in range(4):
            await pipeline.feed(PACKET)
        error = await socket.next("error")
        self.assertEqual((error["status"], error["utteranceId"], error["revision"]), (429, "u4", 0))
        self.assertEqual(len(pipeline.finals), pcm_stream.MAX_FINAL_JOBS)

    async def test_translation_queue_overload_keeps_original_and_settles_only_that_note(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(index, PACKET, True)] for index in range(1, 5)])
        # Run recognition alone to fill the independent bounded text queue.
        pipeline.tasks = [asyncio.create_task(pipeline.recognize())]
        for index in range(1, 5):
            await pipeline.feed(PACKET)
            await socket.next("transcript", f"u{index}")
        error = await socket.next("error", "u4")
        self.assertEqual((error["status"], error["revision"]), (429, 1))
        self.assertEqual(len(pipeline.translations), pcm_stream.MAX_TRANSLATION_JOBS)
        self.assertTrue(engine.stt_slot.acquire(blocking=False))
        engine.stt_slot.release()

    async def test_cancellation_keeps_running_inference_lock_until_actual_completion(self):
        pipeline, socket, engine = await self.make_pipeline([[SpeechSnapshot(1, PACKET, True)]])
        entered, release = threading.Event(), threading.Event()
        def recognize(*_args, **_kwargs):
            entered.set()
            release.wait(3)
            return "private text", "en"
        engine.transcribe_audio = recognize
        pipeline.start()
        try:
            await pipeline.feed(PACKET)
            await wait_thread_event(entered)
            await pipeline.close()
            self.assertFalse(engine.stt_slot.acquire(blocking=False))
            self.assertEqual(socket.events, [])
        finally:
            release.set()
        deadline = time.monotonic() + 3
        while engine.stt_slot.locked() and time.monotonic() < deadline:
            await asyncio.sleep(0.01)
        self.assertFalse(engine.stt_slot.locked())
        self.assertEqual(socket.events, [])

    async def test_busy_final_is_explicit_and_partial_only_warns(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET, True)]])
        engine.stt_slot.acquire()
        pipeline.start()
        try:
            with patch.object(pcm_stream, "LANE_WAIT_SECONDS", 0.01):
                await pipeline.feed(PACKET)
                status = await socket.next("status")
                self.assertEqual(status["status"], 429)
                await pipeline.feed(PACKET)
                error = await socket.next("error")
                self.assertEqual((error["status"], error["utteranceId"]), (429, "u1"))
        finally:
            engine.stt_slot.release()

    async def test_pending_partial_is_coalesced_and_final_has_priority(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET * 2, False)],
            [SpeechSnapshot(1, PACKET * 3, True)], [SpeechSnapshot(2, PACKET, False)]])
        for _ in range(4):
            await pipeline.feed(PACKET)
        calls = []
        def recognize(wav, source, **_kwargs):
            with wave.open(io.BytesIO(wav), "rb") as audio:
                calls.append(audio.getnframes())
            return "Hello", source
        engine.transcribe_audio = recognize
        pipeline.start()
        final = await socket.next("transcript", "u1")
        self.assertTrue(final["isFinal"])
        await socket.next("transcript", "u2")
        self.assertEqual(calls, [6144, 2048])

    async def test_completed_inflight_partial_is_shown_while_queued_final_is_running(self):
        pipeline, socket, engine = await self.make_pipeline([
            [SpeechSnapshot(1, PACKET, False)], [SpeechSnapshot(1, PACKET * 2, True)]])
        partial_entered, final_entered = threading.Event(), threading.Event()
        finish_partial, finish_final = threading.Event(), threading.Event()
        calls = 0
        def recognize(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                partial_entered.set()
                finish_partial.wait(3)
                return "Hello", "en"
            final_entered.set()
            finish_final.wait(3)
            return "Hello world", "en"
        engine.transcribe_audio = recognize
        pipeline.start()
        try:
            await pipeline.feed(PACKET)
            await wait_thread_event(partial_entered)
            await pipeline.feed(PACKET)
            self.assertEqual(len(pipeline.finals), 1)
            finish_partial.set()
            partial = await socket.next("transcript", "u1")
            await wait_thread_event(final_entered)
            self.assertEqual((partial["original"], partial["isFinal"], partial["revision"]),
                             ("Hello", False, 1))
            self.assertFalse(any(event.get("isFinal") for event in socket.events))
            finish_final.set()
            final = await socket.next("transcript", "u1")
            translated = await socket.next("translation", "u1")
            self.assertEqual((final["original"], final["isFinal"], final["revision"]),
                             ("Hello world", True, 2))
            self.assertEqual(translated["revision"], 2)
        finally:
            finish_partial.set()
            finish_final.set()

    async def test_waiting_final_asr_takes_priority_over_other_stream_partial(self):
        final, final_socket, engine = await self.make_pipeline([[SpeechSnapshot(1, PACKET, True)]])
        partial, partial_socket, _ = await self.make_pipeline([[SpeechSnapshot(1, PACKET, False)]])
        partial.backend = engine
        complete = threading.Event()
        def recognize(*_args, **_kwargs):
            complete.wait(3)
            return "Hello", "en"
        engine.transcribe_audio = recognize
        engine.stt_slot.acquire()
        final.start()
        partial.start()
        try:
            await final.feed(PACKET)
            for _ in range(100):
                if pcm_stream._final_waiters:
                    break
                await asyncio.sleep(0.001)
            self.assertGreater(pcm_stream._final_waiters, 0)
            engine.stt_slot.release()
            await partial.feed(PACKET)
            warning = await partial_socket.next("status")
            self.assertEqual(warning["status"], 429)
            complete.set()
            self.assertTrue((await final_socket.next("transcript"))["isFinal"])
        finally:
            complete.set()
            if engine.stt_slot.locked() and not final.running_asr:
                engine.stt_slot.release()


class SocketTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)
        key = patch.object(app, "API_KEY", KEY)
        key.start()
        self.addCleanup(key.stop)
        self.initial_active = pcm_stream._active_streams

    def tearDown(self):
        self.assertEqual(pcm_stream._active_streams, self.initial_active)

    def connect(self, key=KEY):
        return self.client.websocket_connect("/stream/pcm", headers={"x-api-key": key})

    def test_auth_is_checked_before_accept_or_model_loading(self):
        for key, configured, expected in [("wrong", KEY, 401), (KEY, "", 503)]:
            with self.subTest(status=expected), patch.object(app, "API_KEY", configured), \
                    patch.object(pcm_stream, "get_model") as model:
                with self.assertRaises(WebSocketDenialResponse) as denied:
                    with self.connect(key):
                        pass
                self.assertEqual(denied.exception.status_code, expected)
                model.assert_not_called()

    def test_exact_start_config_and_fixed_binary_packet_are_required(self):
        invalid = [{}, {"sourceLanguage": "auto", "targetLanguage": "vi"},
            {"sourceLanguage": "en", "targetLanguage": "en"},
            {"sourceLanguage": "en", "targetLanguage": "vi", "extra": True}, []]
        for config in invalid:
            with self.subTest(config=config), self.connect() as socket:
                socket.send_json(config)
                self.assertEqual(socket.receive_json()["status"], 400)
                with self.assertRaises(WebSocketDisconnect):
                    socket.receive_json()

    def test_ready_without_text_model_then_invalid_packet_closes_and_cleans_up(self):
        with patch.object(app, "whisper_ready", return_value=True), \
                patch.object(app.httpx, "get", side_effect=AssertionError("Qwen health was queried")), \
                self.connect() as socket:
            socket.send_json({"sourceLanguage": "vi", "targetLanguage": "en"})
            self.assertEqual(socket.receive_json(), {"type": "ready", "sampleRate": 16000,
                                                    "channels": 1, "packetSamples": 2048})
            socket.send_bytes(b"\0" * 4095)
            self.assertEqual(socket.receive_json()["status"], 400)
            with self.assertRaises(WebSocketDisconnect):
                socket.receive_json()

    def test_text_controls_and_burst_flood_fail_closed(self):
        with patch.object(app, "whisper_ready", return_value=True), \
                patch.object(pcm_stream, "SpeechSegmenter", return_value=ScriptSegmenter()):
            with self.connect() as socket:
                socket.send_json({"sourceLanguage": "en", "targetLanguage": "vi"})
                socket.receive_json()
                socket.send_text("stop")
                self.assertEqual(socket.receive_json()["status"], 400)
            with self.connect() as socket:
                socket.send_json({"sourceLanguage": "en", "targetLanguage": "vi"})
                socket.receive_json()
                for _ in range(5):
                    socket.send_bytes(PACKET)
                self.assertEqual(socket.receive_json()["status"], 429)

    def test_readiness_model_failure_and_idle_timeout_have_no_utterance_and_close(self):
        with patch.object(pcm_stream, "get_model", side_effect=RuntimeError("bad model")), self.connect() as socket:
            socket.send_json({"sourceLanguage": "en", "targetLanguage": "vi"})
            event = socket.receive_json()
            self.assertEqual(event["status"], 503)
            self.assertNotIn("utteranceId", event)
        with patch.object(app, "whisper_ready", return_value=True), \
                patch.object(pcm_stream, "IDLE_SECONDS", 0.03), self.connect() as socket:
            socket.send_json({"sourceLanguage": "en", "targetLanguage": "vi"})
            self.assertEqual(socket.receive_json()["type"], "ready")
            self.assertEqual(socket.receive_json()["status"], 408)

    def test_process_stream_cap_denies_before_upgrade(self):
        with patch.object(pcm_stream, "MAX_STREAMS", 0):
            with self.assertRaises(WebSocketDenialResponse) as denied:
                with self.connect():
                    pass
            self.assertEqual(denied.exception.status_code, 429)

    def test_pcm_health_requires_vad_and_whisper_but_never_qwen(self):
        headers = {"x-api-key": KEY}
        with patch.object(app, "whisper_ready", return_value=True), \
                patch.object(app.httpx, "get", side_effect=AssertionError("Qwen health was queried")):
            self.assertEqual(self.client.get("/health?mode=pcm", headers=headers).json(), {"status": "ready"})
            with patch.object(app, "get_model", side_effect=RuntimeError("bad model")):
                self.assertEqual(self.client.get("/health?mode=pcm", headers=headers).status_code, 503)

    def test_self_speech_translate_false_emits_transcript_only_and_skips_translation(self):
        calls = []
        with patch.object(app, "whisper_ready", return_value=True), \
                patch.object(app, "transcribe_audio", return_value=("Xin chào", "vi")), \
                patch.object(app, "translate_text", side_effect=lambda *args, **kwargs: calls.append(args) or "Hello"), \
                patch.object(pcm_stream, "SpeechSegmenter", return_value=ScriptSegmenter([[SpeechSnapshot(1, PACKET, True)]])), \
                self.connect() as socket:
            socket.send_json({"sourceLanguage": "vi", "targetLanguage": "vi", "translate": False})
            self.assertEqual(socket.receive_json()["type"], "ready")
            socket.send_bytes(PACKET)
            transcript = socket.receive_json()
            self.assertEqual(transcript["type"], "transcript")
            self.assertEqual(transcript["original"], "Xin chào")
            self.assertIs(transcript["translate"], False)
            self.assertTrue(transcript["isFinal"])
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()

