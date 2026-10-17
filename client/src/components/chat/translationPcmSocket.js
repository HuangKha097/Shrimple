export const PCM_PACKET_BYTES = 4096;
export const PCM_MAX_IN_FLIGHT = 2;
const START_TIMEOUT = 15000;
const AUDIO_TIMEOUT = 2500;

// No captured audio is ever queued here: a slow/disconnected transport ends the
// stream, allowing the caller to restart with a visible interruption and seq=0.
export function createTranslationPcmSocket({ socket, request, onReady, onEvent, onFailure,
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    let closed = false;
    let streamId;
    let sequence = 0;
    let pending = 0;
    const timers = new Set();
    const schedule = (callback, delay) => {
        const timer = setTimer(() => { timers.delete(timer); callback(); }, delay);
        timers.add(timer);
        return timer;
    };
    const cancelTimer = timer => { clearTimer(timer); timers.delete(timer); };
    const stopServer = id => { if (id && socket.connected) socket.emit('translation:stop', { streamId: id }); };
    const stop = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearTimer);
        timers.clear();
        socket.off('translation:event', receive);
        socket.off('disconnect', disconnected);
        stopServer(streamId);
        pending = 0;
    };
    const fail = (status, message) => {
        if (closed) return;
        stop();
        onFailure({ status, message, streamId });
    };
    const disconnected = () => fail(503, 'Connection interrupted.');
    const receive = event => {
        if (closed || !streamId || event?.streamId !== streamId || event.speakerId !== request.speakerId) return;
        if ((event.sourceLanguage && event.sourceLanguage !== request.sourceLanguage) ||
            (event.targetLanguage && event.targetLanguage !== request.targetLanguage)) return;
        if (event.type === 'error' && (!event.utteranceId || [401, 403].includes(event.status))) {
            fail(event.status, event.message);
            return;
        }
        onEvent(event);
    };
    socket.on('translation:event', receive);
    socket.on('disconnect', disconnected);
    if (!socket.connected) {
        fail(503, 'Connection interrupted.');
    } else {
        const timer = schedule(() => fail(504, 'Translation stream did not start.'), START_TIMEOUT);
        socket.emit('translation:start', request, ack => {
            cancelTimer(timer);
            if (closed) { if (ack?.ok === true) stopServer(ack.streamId); return; }
            if (!ack?.ok) { fail(ack?.status || 503, ack?.message); return; }
            if (typeof ack.streamId !== 'string' || !ack.streamId || ack.streamId.length > 128 ||
                ack.sampleRate !== 16000 || ack.channels !== 1 || ack.packetSamples !== 2048) {
                stopServer(ack.streamId);
                fail(502, 'Invalid translation audio configuration.');
                return;
            }
            streamId = ack.streamId;
            onReady(streamId);
        });
    }
    const send = audio => {
        if (closed || !streamId) return false;
        if (!socket.connected) { disconnected(); return false; }
        if (!(audio instanceof ArrayBuffer) || audio.byteLength !== PCM_PACKET_BYTES) {
            fail(400, 'Invalid captured audio packet.');
            return false;
        }
        if (pending >= PCM_MAX_IN_FLIGHT) {
            fail(429, 'Audio processing is behind; stream restarted.');
            return false;
        }
        pending += 1;
        const seq = sequence++;
        const timer = schedule(() => fail(504, 'Audio acknowledgement timed out.'), AUDIO_TIMEOUT);
        socket.emit('translation:audio', { streamId, seq, audio }, ack => {
            cancelTimer(timer);
            if (closed) return;
            pending -= 1;
            if (!ack?.ok) fail(ack?.status || 503, ack?.message);
        });
        return true;
    };
    return { send, stop, get streamId() { return streamId; } };
}
