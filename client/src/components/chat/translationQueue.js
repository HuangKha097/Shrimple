// Keep recognition moving while one earlier translation is still pending.
// Each speaker has at most two open requests and one newest queued clip.
export function createTranslationQueue(sendClip, { onChange, onSkipped, onError }) {
    const pending = [];
    const active = new Set();
    let recognizing = false;
    let stopped = false;

    const pump = () => {
        if (stopped || recognizing || active.size >= 2 || pending.length === 0) return;
        const clip = pending.shift();
        const request = { recognizing: true };
        active.add(request);
        recognizing = true;
        onChange();
        const releaseRecognition = () => {
            if (!request.recognizing) return;
            request.recognizing = false;
            recognizing = false;
            pump();
        };
        void (async () => {
            try {
                await sendClip(clip, releaseRecognition);
            } catch (error) {
                if (!stopped) onError(error);
            } finally {
                active.delete(request);
                releaseRecognition();
                onChange();
                pump();
            }
        })();
    };

    return {
        get size() { return stopped ? 0 : active.size + pending.length; },
        push(clip) {
            if (stopped) return;
            if (pending.length) {
                pending.shift();
                onSkipped();
            }
            pending.push(clip);
            onChange();
            pump();
        },
        stop() {
            stopped = true;
            pending.length = 0;
        },
    };
}
