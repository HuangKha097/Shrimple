"""Authenticated PCM socket and bounded independent recognition/translation lanes."""

import asyncio
from collections import deque
from dataclasses import dataclass
import json
import threading
import time

import httpx
from fastapi import HTTPException, WebSocketDisconnect
from fastapi.responses import JSONResponse

from pcm_vad import PACKET_BYTES, PACKET_SAMPLES, SAMPLE_RATE, SpeechSegmenter, get_model, pcm_wav

MAX_STREAMS = 64
MAX_FINAL_JOBS = 3
MAX_TRANSLATION_JOBS = 3
MAX_EVENT_BYTES = 64 * 1024
MAX_TEXT_CHARS = 8192
SETUP_SECONDS = 5
IDLE_SECONDS = 5
LANE_WAIT_SECONDS = 5
JOB_SECONDS = 80
PACKETS_PER_SECOND = 12
PACKET_BURST = 4
_active_streams = 0
_admission_lock = threading.Lock()
_priority_lock = threading.Lock()
_final_waiters = 0


def admit():
    global _active_streams
    with _admission_lock:
        if _active_streams >= MAX_STREAMS:
            return False
        _active_streams += 1
        return True


def release():
    global _active_streams
    with _admission_lock:
        _active_streams -= 1


@dataclass
class Utterance:
    identifier: str
    revision: int = 0
    final_requested: bool = False
    final_emitted: bool = False
    failed: bool = False


@dataclass
class RecognitionJob:
    utterance: Utterance
    pcm: bytes
    final: bool
    deadline: float


class PcmPipeline:
    def __init__(self, websocket, backend, source, target, segmenter=None, *, translate_enabled=True):
        self.websocket, self.backend = websocket, backend
        self.source, self.target = source, target
        self.translate_enabled = bool(translate_enabled)
        self.segmenter = SpeechSegmenter() if segmenter is None else segmenter
        self.finals = deque()
        self.translations = deque()
        self.partial = None
        self.current = None
        self.asr_signal, self.text_signal = asyncio.Event(), asyncio.Event()
        self.stopped = threading.Event()
        self.send_lock = asyncio.Lock()
        self.tasks = []
        self.running_asr = self.running_text = 0
        self.partial_busy = False

    def start(self):
        self.tasks = [asyncio.create_task(self.recognize()), asyncio.create_task(self.translate())]

    async def send(self, event):
        if self.stopped.is_set():
            return
        payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode("utf-8")) > MAX_EVENT_BYTES:
            raise ValueError("Event too large")
        async with self.send_lock:
            if not self.stopped.is_set():
                await self.websocket.send_text(payload)

    async def error(self, status, message, utterance=None):
        event = {"type": "error", "status": status, "message": message}
        if utterance is not None:
            utterance.failed = True
            event.update(utteranceId=utterance.identifier, revision=utterance.revision)
        await self.send(event)

    async def feed(self, packet):
        if any(task.done() for task in self.tasks):
            raise RuntimeError("Streaming worker stopped")
        snapshots = await asyncio.to_thread(self.segmenter.feed, packet)
        for snapshot in snapshots:
            identifier = f"u{snapshot.utterance}"
            if self.current is None or self.current.identifier != identifier:
                self.current = Utterance(identifier)
            utterance = self.current
            if utterance.failed:
                continue
            job = RecognitionJob(utterance, snapshot.pcm, snapshot.is_final,
                                 time.monotonic() + JOB_SECONDS)
            if snapshot.is_final:
                utterance.final_requested = True
                if self.partial and self.partial.utterance is utterance:
                    self.partial = None
                if len(self.finals) + self.running_asr >= MAX_FINAL_JOBS:
                    await self.error(429, "Speech recognition queue is full", utterance)
                    continue
                self.finals.append(job)
            else:
                # Replace old pending partial work with the newest audio window.
                self.partial = job
            self.asr_signal.set()

    async def run_lane(self, slot, work, deadline, *, partial=False, final_asr=False):
        global _final_waiters
        wait_until = min(deadline, time.monotonic() + LANE_WAIT_SECONDS)
        if final_asr:
            with _priority_lock:
                _final_waiters += 1
        try:
            while True:
                with _priority_lock:
                    acquired = (not partial or not _final_waiters) and slot.acquire(blocking=False)
                if acquired:
                    break
                if partial or time.monotonic() >= wait_until:
                    raise HTTPException(429, "Inference is busy")
                if self.stopped.is_set():
                    raise asyncio.CancelledError()
                await asyncio.sleep(0.05)
        finally:
            if final_asr:
                with _priority_lock:
                    _final_waiters -= 1

        def invoke():
            # The sync thread owns release. Cancelling the socket's await cannot
            # free a lane while its HTTP inference is still running.
            try:
                if self.stopped.is_set():
                    return None
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise HTTPException(504, "Inference timed out")
                return work(remaining)
            finally:
                slot.release()

        # Schedule before the next await, so cancellation cannot strand a lock
        # acquired above without an executing release owner.
        loop = asyncio.get_running_loop()
        try:
            future = loop.run_in_executor(None, invoke)
        except BaseException:
            slot.release()
            raise
        # A disconnected caller abandons the await, but the bounded sync job
        # still finishes with its lane held. Retrieve any detached exception.
        future.add_done_callback(lambda done: None if done.cancelled() else done.exception())
        return await asyncio.shield(future)

    async def recognize(self):
        while not self.stopped.is_set():
            await self.asr_signal.wait()
            self.asr_signal.clear()
            while (self.finals or self.partial) and not self.stopped.is_set():
                if self.finals:
                    job = self.finals.popleft()
                else:
                    job, self.partial = self.partial, None
                utterance = job.utterance
                if utterance.failed or (not job.final and utterance.final_requested):
                    continue
                self.running_asr = int(job.final)
                try:
                    result = await self.run_lane(self.backend.stt_slot,
                        lambda remaining: self.backend.transcribe_audio(pcm_wav(job.pcm), self.source,
                            timeout=min(remaining, self.backend.WHISPER_TIMEOUT_SECONDS)),
                        job.deadline, partial=not job.final, final_asr=job.final)
                    if result is None or self.stopped.is_set() or utterance.failed:
                        continue
                    if not job.final and utterance.final_emitted:
                        continue
                    original, detected = result
                    if (not isinstance(original, str) or len(original) > MAX_TEXT_CHARS
                            or detected != self.source):
                        raise ValueError("Invalid recognition result")
                    if time.monotonic() >= job.deadline:
                        raise HTTPException(504, "Inference timed out")
                    original = original.strip()
                    if not original:
                        if job.final and utterance.revision:
                            await self.error(422, "No speech recognized in the final utterance", utterance)
                        continue
                    utterance.revision += 1
                    utterance.final_emitted = job.final
                    event = {"type": "transcript", "utteranceId": utterance.identifier,
                        "revision": utterance.revision, "original": original,
                        "sourceLanguage": self.source, "targetLanguage": self.target,
                        "isFinal": job.final}
                    if not self.translate_enabled:
                        event["translate"] = False
                    await self.send(event)
                    self.partial_busy = False
                    if job.final and original and self.translate_enabled:
                        if len(self.translations) + self.running_text >= MAX_TRANSLATION_JOBS:
                            await self.error(429, "Translation queue is full", utterance)
                        else:
                            self.translations.append((utterance, original, job.deadline))
                            self.text_signal.set()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    status = error_status(exc)
                    if job.final:
                        await self.error(status, error_message(status), utterance)
                    elif not self.partial_busy:
                        # A superseded partial can be retried from a later growing
                        # window; it must not settle the final note as failed.
                        self.partial_busy = True
                        await self.send({"type": "status", "status": 429 if status == 429 else 503,
                            "message": "Speech recognition is waiting", "utteranceId": utterance.identifier,
                            "revision": utterance.revision})
                finally:
                    self.running_asr = 0

    async def translate(self):
        while not self.stopped.is_set():
            await self.text_signal.wait()
            self.text_signal.clear()
            while self.translations and not self.stopped.is_set():
                utterance, original, deadline = self.translations.popleft()
                self.running_text = 1
                try:
                    translated = await self.run_lane(self.backend.text_translation_slot,
                        lambda remaining: self.backend.translate_text(original, self.source, self.target,
                            timeout=min(65, remaining)), deadline)
                    if translated is None or self.stopped.is_set():
                        continue
                    if not isinstance(translated, str) or not translated.strip() or len(translated) > MAX_TEXT_CHARS:
                        raise ValueError("Invalid translation result")
                    if time.monotonic() >= deadline:
                        raise HTTPException(504, "Inference timed out")
                    await self.send({"type": "translation", "utteranceId": utterance.identifier,
                                     "revision": utterance.revision, "translated": translated})
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    status = error_status(exc)
                    await self.error(status, error_message(status), utterance)
                finally:
                    self.running_text = 0

    async def close(self):
        self.stopped.set()
        self.partial = self.current = None
        self.finals.clear()
        self.translations.clear()
        self.segmenter = None
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)


def error_status(exc):
    if isinstance(exc, HTTPException) and exc.status_code in (429, 504):
        return exc.status_code
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return 504
    return 503


def error_message(status):
    return {429: "Inference is busy", 504: "Inference timed out"}.get(status, "Inference unavailable")


async def pcm_socket(websocket, backend):
    # No WebSocket upgrade, audio allocation or readiness work before backend auth.
    try:
        backend.authorize(websocket.headers.get("x-api-key"))
    except HTTPException as exc:
        await websocket.send_denial_response(JSONResponse({"detail": exc.detail}, status_code=exc.status_code))
        return
    if not admit():
        await websocket.send_denial_response(JSONResponse({"detail": "Streaming is busy"}, status_code=429))
        return
    pipeline = None
    try:
        await websocket.accept()
        first = await asyncio.wait_for(websocket.receive(), SETUP_SECONDS)
        if first["type"] == "websocket.disconnect":
            return
        text = first.get("text")
        if not isinstance(text, str) or len(text.encode("utf-8")) > 1024:
            raise HTTPException(400, "Invalid stream configuration")
        try:
            config = json.loads(text)
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, "Invalid stream configuration") from exc
        if (not isinstance(config, dict)
                or not set(config).issubset({"sourceLanguage", "targetLanguage", "translate"})
                or not {"sourceLanguage", "targetLanguage"}.issubset(set(config))
                or config["sourceLanguage"] not in ("en", "vi")
                or config["targetLanguage"] not in ("en", "vi")
                or ("translate" in config and not isinstance(config["translate"], bool))):
            raise HTTPException(400, "Invalid stream configuration")
        translate_enabled = config.get("translate", True)
        if translate_enabled:
            if config["sourceLanguage"] == config["targetLanguage"]:
                raise HTTPException(400, "Invalid stream configuration")
        elif config["sourceLanguage"] != config["targetLanguage"]:
            raise HTTPException(400, "Invalid stream configuration")

        def ready():
            get_model()
            if not backend.whisper_ready():
                raise HTTPException(503, "Speech recognition is loading")

        try:
            await asyncio.wait_for(asyncio.to_thread(ready), SETUP_SECONDS)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(503, "Speech recognition is loading") from exc
        pipeline = PcmPipeline(websocket, backend, config["sourceLanguage"], config["targetLanguage"],
                               translate_enabled=translate_enabled)
        await pipeline.send({"type": "ready", "sampleRate": SAMPLE_RATE, "channels": 1,
                             "packetSamples": PACKET_SAMPLES})
        pipeline.start()
        tokens, last = float(PACKET_BURST), time.monotonic()
        while True:
            message = await asyncio.wait_for(websocket.receive(), IDLE_SECONDS)
            if message["type"] == "websocket.disconnect":
                break
            packet = message.get("bytes")
            if not isinstance(packet, bytes) or len(packet) != PACKET_BYTES:
                raise HTTPException(400, "Invalid PCM packet")
            now = time.monotonic()
            tokens = min(PACKET_BURST, tokens + (now - last) * PACKETS_PER_SECOND)
            last = now
            if tokens < 1:
                raise HTTPException(429, "Audio rate limit exceeded")
            tokens -= 1
            await pipeline.feed(packet)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        status = 408 if isinstance(exc, TimeoutError) else (
            exc.status_code if isinstance(exc, HTTPException) else 503)
        message = {400: "Invalid PCM stream", 408: "Audio stream timed out",
                   429: "Streaming is busy"}.get(status, "Speech recognition unavailable")
        try:
            if pipeline:
                await pipeline.error(status, message)
            else:
                await websocket.send_json({"type": "error", "status": status, "message": message})
            await websocket.close(code=1008)
        except (WebSocketDisconnect, RuntimeError):
            pass
    finally:
        if pipeline:
            await pipeline.close()
        release()
