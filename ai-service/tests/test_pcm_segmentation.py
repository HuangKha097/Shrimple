"""Continuous speech regression: real segmentation, fake ASR/translation, no private audio."""
import asyncio
import json
import threading
import unittest

import numpy as np
from pcm_vad import (SpeechSegmenter, FRAME_BYTES, PACKET_BYTES, MAX_UTTERANCE_FRAMES,
                     SOFT_UTTERANCE_FRAMES, get_model)
from pcm_stream import PcmPipeline


def frame(amplitude):
    return np.full(FRAME_BYTES // 2, amplitude, dtype="<i2").tobytes()


class Voice:
    def probability(self, data):
        return .9 if any(data) else 0


def feed_frames(segmenter, frames):
    assert len(frames) % 4 == 0
    result = []
    for index in range(0, len(frames), 4):
        result.extend(segmenter.feed(b"".join(frames[index:index + 4])))
    return result


class SegmentationTests(unittest.TestCase):
    def test_two_minutes_unbroken_audio_no_lost_or_duplicated_samples(self):
        audio = [frame(1000 + i % 97) for i in range(3752)]
        segmenter = SpeechSegmenter(Voice())
        finals = [s for s in feed_frames(segmenter, audio) if s.is_final]
        self.assertGreater(len(finals), 10)
        self.assertTrue(all(len(s.pcm) <= MAX_UTTERANCE_FRAMES * FRAME_BYTES for s in finals))
        self.assertEqual(b"".join(s.pcm for s in finals) + b"".join(segmenter.frames), b"".join(audio))
        self.assertEqual([s.utterance for s in finals], list(range(1, len(finals) + 1)))

    def test_quiet_valley_at_limit_retains_exact_tail(self):
        audio = [frame(1000)] * 252
        audio[227:230] = [frame(1)] * 3
        segmenter = SpeechSegmenter(Voice())
        finals = [s for s in feed_frames(segmenter, audio) if s.is_final]
        self.assertEqual(len(finals), 1)
        self.assertEqual(len(finals[0].pcm), 230 * FRAME_BYTES)
        self.assertEqual(b"".join(segmenter.frames), b"".join(audio[230:]))
        self.assertEqual(segmenter.utterance, 2)

    def test_short_pause_settles_long_clause_without_320ms_wait(self):
        segmenter = SpeechSegmenter(Voice())
        audio = [frame(1000)] * 129 + [frame(0)] * 3
        finals = [s for s in feed_frames(segmenter, audio) if s.is_final]
        self.assertEqual(len(finals), 1)
        self.assertEqual(finals[0].pcm, b"".join(audio))
        self.assertEqual(segmenter.frames, [])

    def test_short_pause_before_four_seconds_does_not_split(self):
        segmenter = SpeechSegmenter(Voice())
        audio = [frame(1000)] * 60 + [frame(0)] * 3 + [frame(1000)]
        self.assertFalse(any(s.is_final for s in feed_frames(segmenter, audio)))

    def test_normal_end_and_silence_remain_bounded(self):
        segmenter = SpeechSegmenter(Voice())
        self.assertEqual(feed_frames(segmenter, [frame(0)] * 40), [])
        finals = [s for s in feed_frames(segmenter, [frame(1000)] * 20 + [frame(0)] * 12) if s.is_final]
        self.assertEqual(len(finals), 1)
        self.assertFalse(segmenter.frames)
        self.assertLessEqual(len(segmenter.pre_roll), 8)

    def test_real_silero_session_still_initializes(self):
        model = get_model()
        probability, state = model.probability(np.zeros((1, 576), np.float32), np.zeros((2, 1, 128), np.float32))
        self.assertTrue(0 <= probability <= 1)
        self.assertEqual(state.shape, (2, 1, 128))


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_speech_continues_while_final_chunks_translate_in_order(self):
        class Socket:
            def __init__(self): self.events = []
            async def send_text(self, data): self.events.append(json.loads(data))
        class Backend:
            stt_slot = threading.Semaphore(1)
            text_translation_slot = threading.Semaphore(1)
            WHISPER_TIMEOUT_SECONDS = 5
            def transcribe_audio(self, audio, source, **kwargs): return "recognized chunk", source
            def translate_text(self, original, source, target, **kwargs): return "translated chunk"
        socket = Socket()
        pipeline = PcmPipeline(socket, Backend(), "vi", "en", SpeechSegmenter(Voice()))
        pipeline.start()
        try:
            audio = [frame(1000)] * 376 + [frame(0)] * 12
            for i in range(0, len(audio), 4):
                await pipeline.feed(b"".join(audio[i:i + 4]))
                await asyncio.sleep(.002)
                if i == 300:
                    self.assertTrue(any(e["type"] == "translation" for e in socket.events))
            async def finished():
                while len([e for e in socket.events if e["type"] == "translation"]) < 2:
                    await asyncio.sleep(.01)
            await asyncio.wait_for(finished(), 3)
            finals = [e for e in socket.events if e["type"] == "transcript" and e["isFinal"]]
            translated = [e for e in socket.events if e["type"] == "translation"]
            self.assertEqual([e["utteranceId"] for e in finals], ["u1", "u2"])
            self.assertEqual([(e["utteranceId"], e["revision"]) for e in translated],
                             [(e["utteranceId"], e["revision"]) for e in finals])
            self.assertFalse(any(e["type"] == "error" for e in socket.events))
        finally:
            await pipeline.close()
