"""Pinned Silero inference and bounded 16 kHz speech segmentation; no audio files."""

from collections import deque
from dataclasses import dataclass
from pathlib import Path
import hashlib
import io
import threading
import wave
from speech_quality import unfinished_vietnamese, words

import numpy as np
import onnxruntime as ort

SAMPLE_RATE = 16000
PACKET_SAMPLES = 2048
PACKET_BYTES = PACKET_SAMPLES * 2
FRAME_SAMPLES = 512
FRAME_BYTES = FRAME_SAMPLES * 2
PRE_ROLL_FRAMES = 8  # 256 ms before the first detected speech frame.
END_SILENCE_FRAMES = 10  # 320 ms.
MAX_UTTERANCE_FRAMES = 250  # Eight seconds, including pre-roll and tail.
SOFT_UTTERANCE_FRAMES = 125  # After four seconds, a short pause can settle a clause.
SOFT_SILENCE_FRAMES = 3  # 96 ms; normal end-of-speech still uses 320 ms.
CUT_LOOKBACK_FRAMES = 40  # Search the last 1.28 s if speech never pauses.
CUT_ENERGY_FRAMES = 3  # Prefer a quiet 96 ms interval over a single zero crossing.
PARTIAL_AFTER_FRAMES = 19  # 608 ms of actual speech.
PARTIAL_STRIDE_FRAMES = 16  # 512 ms between growing-window snapshots.
MODEL_PATH = Path(__file__).parent / "models" / "silero-vad-v6.2.onnx"
MODEL_SHA256 = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"


def pcm_wav(pcm):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)
    return output.getvalue()


class SileroModel:
    """One CPU session; state is supplied by each stream, never stored here."""

    def __init__(self, path=MODEL_PATH):
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != MODEL_SHA256:
            raise RuntimeError("Silero model checksum mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.log_severity_level = 3
        self.session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
        inputs = {item.name: (item.type, item.shape) for item in self.session.get_inputs()}
        if inputs != {"input": ("tensor(float)", [None, None]),
                      "state": ("tensor(float)", [2, None, 128]), "sr": ("tensor(int64)", [])}:
            raise RuntimeError("Incompatible Silero inputs")
        if [item.name for item in self.session.get_outputs()] != ["output", "stateN"]:
            raise RuntimeError("Incompatible Silero outputs")
        # Readiness tests inference and output shape as well as the pinned bytes.
        self.probability(np.zeros((1, 576), np.float32), np.zeros((2, 1, 128), np.float32))

    def probability(self, samples, state):
        probability, new_state = self.session.run(None, {
            "input": samples, "state": state, "sr": np.array(SAMPLE_RATE, np.int64),
        })
        if (probability.shape != (1, 1) or new_state.shape != (2, 1, 128)
                or not np.isfinite(probability).all() or not np.isfinite(new_state).all()
                or not 0 <= float(probability[0, 0]) <= 1):
            raise RuntimeError("Invalid Silero output")
        return float(probability[0, 0]), new_state


_model = None
_model_lock = threading.Lock()


def get_model():
    global _model
    with _model_lock:
        if _model is None:
            _model = SileroModel()
        return _model


class SileroStream:
    def __init__(self, model=None):
        self.model = get_model() if model is None else model
        self.state = np.zeros((2, 1, 128), np.float32)
        self.context = np.zeros((1, 64), np.float32)

    def probability(self, frame):
        samples = np.frombuffer(frame, dtype="<i2").astype(np.float32).reshape(1, -1) / 32768
        joined = np.concatenate((self.context, samples), axis=1)
        probability, self.state = self.model.probability(joined, self.state)
        self.context = samples[:, -64:].copy()
        return probability


@dataclass
class SpeechSnapshot:
    utterance: int
    pcm: bytes
    is_final: bool


class SpeechSegmenter:
    def __init__(self, vad=None, *, language="en"):
        self.vad = SileroStream() if vad is None else vad
        self.pre_roll = deque(maxlen=PRE_ROLL_FRAMES)
        self.frames = []
        self.utterance = 0
        self.silence = self.voiced = self.since_partial = 0
        self.continuation = False
        self.language = language
        self.max_frames = 375 if language == "vi" else MAX_UTTERANCE_FRAMES
        self.transcript_hint = None

    def observe_transcript(self, utterance, text, audio_frames):
        # One immutable assignment from the async worker; the VAD thread checks
        # identity and age before using it. No text is shared across streams.
        self.transcript_hint = (utterance, text, audio_frames)

    def end_silence_frames(self):
        if self.language != "vi":
            return END_SILENCE_FRAMES
        hint = self.transcript_hint
        if hint and hint[0] == self.utterance and 0 <= len(self.frames)-hint[2] <= 64:
            if unfinished_vietnamese(hint[1]):
                return 35  # 1.12s for an explicit dangling connector/predicate.
            tokens = words(hint[1])
            if len(tokens) >= 4 and tokens[-1] in ("nhé", "ạ"):
                return 16  # 512ms after a likely closing particle.
        return 20  # 640ms; do not settle a thinking pause at 96/320ms.

    def forced_boundary(self):
        # No overlap or transcript trimming: each input frame belongs to one final.
        # Pick the end of the quietest short interval near the deadline. This is
        # acoustic segmentation, not a guarantee of word/sentence boundaries.
        first = max(SOFT_UTTERANCE_FRAMES, len(self.frames) - CUT_LOOKBACK_FRAMES)
        energies = [float(np.mean(np.square(np.frombuffer(frame, dtype="<i2").astype(np.float32))))
                    for frame in self.frames]
        candidates = range(first, len(self.frames) + 1)
        return min(candidates, key=lambda cut: (sum(energies[cut - CUT_ENERGY_FRAMES:cut]), -cut))

    def feed(self, packet):
        if len(packet) != PACKET_BYTES:
            raise ValueError("Invalid PCM packet")
        snapshots = []
        for offset in range(0, PACKET_BYTES, FRAME_BYTES):
            frame = packet[offset:offset + FRAME_BYTES]
            probability = self.vad.probability(frame)
            if not self.frames:
                if probability < (0.35 if self.continuation else 0.5):
                    self.pre_roll.append(frame)
                    self.continuation = False
                    continue
                self.utterance += 1
                self.frames = list(self.pre_roll)
                self.pre_roll.clear()
                self.silence = self.voiced = self.since_partial = 0
            self.frames.append(frame)
            # Hysteresis keeps low-confidence phonemes within an active utterance.
            if probability >= 0.35:
                self.voiced += 1
                self.silence = 0
            else:
                self.silence += 1
            self.since_partial += 1
            soft_pause = (self.language != "vi" and len(self.frames) >= SOFT_UTTERANCE_FRAMES
                          and self.silence >= SOFT_SILENCE_FRAMES)
            at_limit = len(self.frames) >= self.max_frames
            final = self.silence >= self.end_silence_frames() or soft_pause or at_limit
            if final:
                cut = self.forced_boundary() if at_limit and not self.silence else len(self.frames)
                snapshots.append(SpeechSnapshot(self.utterance, b"".join(self.frames[:cut]), True))
                remainder = self.frames[cut:]
                if remainder:
                    # These frames were already VAD-processed: retain them exactly
                    # once without replaying VAD state or losing a mid-packet tail.
                    self.utterance += 1
                    self.frames = remainder
                    self.voiced = len(remainder)
                    self.silence = self.since_partial = 0
                    self.continuation = False
                else:
                    self.continuation = at_limit and not self.silence
                    self.pre_roll.extend(self.frames[-min(self.silence, PRE_ROLL_FRAMES):]
                                         if self.silence else [])
                    self.frames = []
                    self.since_partial = 0
                continue
            if (self.voiced >= PARTIAL_AFTER_FRAMES
                         and self.since_partial >= PARTIAL_STRIDE_FRAMES):
                snapshots.append(SpeechSnapshot(self.utterance, b"".join(self.frames), False))
                self.since_partial = 0
        return snapshots
