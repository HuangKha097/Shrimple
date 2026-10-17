// Self-contained: Vite emits this module as an AudioWorklet asset via ?url.
export const PCM_SAMPLE_RATE = 16000;
export const PCM_PACKET_SAMPLES = 2048;

// Integrate input sample intervals instead of rounding each render quantum.
// Fractional state survives calls, including the 44,100 -> 16,000 Hz boundary.
export class PcmPacketizer {
    constructor(inputSampleRate, onPacket) {
        if (!Number.isFinite(inputSampleRate) || inputSampleRate < PCM_SAMPLE_RATE) {
            throw new RangeError('Unsupported audio sample rate.');
        }
        this.ratio = inputSampleRate / PCM_SAMPLE_RATE;
        this.remaining = this.ratio;
        this.integral = 0;
        this.onPacket = onPacket;
        this.packet = new ArrayBuffer(PCM_PACKET_SAMPLES * 2);
        this.view = new DataView(this.packet);
        this.offset = 0;
    }

    push(channels) {
        if (!channels.length || !channels[0]?.length) return;
        for (let index = 0; index < channels[0].length; index += 1) {
            let mono = 0;
            for (const channel of channels) mono += Number.isFinite(channel[index]) ? channel[index] : 0;
            mono /= channels.length;
            let available = 1;
            while (available > 1e-9) {
                const weight = Math.min(available, this.remaining);
                this.integral += mono * weight;
                this.remaining -= weight;
                available -= weight;
                if (this.remaining < 1e-9) {
                    const sample = Math.max(-1, Math.min(1, this.integral / this.ratio));
                    this.view.setInt16(this.offset * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
                    this.offset += 1;
                    this.integral = 0;
                    this.remaining = this.ratio;
                    if (this.offset === PCM_PACKET_SAMPLES) {
                        this.onPacket(this.packet);
                        this.packet = new ArrayBuffer(PCM_PACKET_SAMPLES * 2);
                        this.view = new DataView(this.packet);
                        this.offset = 0;
                    }
                }
            }
        }
    }
}

if (typeof globalThis.AudioWorkletProcessor === 'function') {
    class TranslationPcmProcessor extends globalThis.AudioWorkletProcessor {
        constructor(options) {
            super();
            this.stopped = false;
            this.packetizer = new PcmPacketizer(options.processorOptions.inputSampleRate,
                audio => this.port.postMessage(audio, [audio]));
            this.port.onmessage = event => { if (event.data === 'stop') this.stopped = true; };
        }

        process(inputs, outputs) {
            for (const output of outputs) for (const channel of output) channel.fill(0);
            if (this.stopped) return false;
            this.packetizer.push(inputs[0] || []);
            return true;
        }
    }
    globalThis.registerProcessor('translation-pcm', TranslationPcmProcessor);
}
