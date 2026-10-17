export function createPcmAudioContext(AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext) {
    if (!AudioContextClass || !globalThis.AudioWorkletNode) throw new Error('AudioWorklet is unavailable.');
    const context = new AudioContextClass({ latencyHint: 'interactive' });
    // Called directly from the panel's user gesture before waiting for health/start.
    void context.resume().catch(() => {});
    return context;
}

export function createPcmCapture({ context, moduleReady, track, onPacket, onError,
    WorkletNode = globalThis.AudioWorkletNode, MediaStreamClass = globalThis.MediaStream }) {
    let stopped = false;
    let source;
    let node;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (node) {
            node.port.onmessage = null;
            node.onprocessorerror = null;
            node.port.postMessage('stop');
            node.port.close();
            node.disconnect();
        }
        source?.disconnect();
        // The track belongs to WebRTC. Disconnecting this graph must not stop it.
    };
    const ready = (async () => {
        try {
            await moduleReady;
            if (stopped) return;
            if (context.state !== 'running') throw new Error('Audio capture needs a user gesture.');
            source = context.createMediaStreamSource(new MediaStreamClass([track]));
            node = new WorkletNode(context, 'translation-pcm', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
                processorOptions: { inputSampleRate: context.sampleRate },
            });
            node.port.onmessage = event => {
                if (!stopped) onPacket(event.data);
            };
            node.onprocessorerror = () => { if (!stopped) onError(new Error('Audio processor stopped.')); };
            // The processor writes silence, so the counterpart is never played twice.
            source.connect(node);
            node.connect(context.destination);
        } catch (error) {
            if (!stopped) {
                stop();
                onError(error);
            }
        }
    })();
    return { stop, ready };
}
