import assert from 'node:assert/strict';

const rate = 16000;
const samples = rate;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);

const form = new FormData();
form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'silence.wav');
form.append('target_language', 'vi');
const response = await fetch(`${process.env.TRANSLATION_AI_URL}/translate`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.TRANSLATION_AI_KEY },
    body: form,
    signal: AbortSignal.timeout(90000),
});
const body = await response.json();
assert.equal(response.status, 200, JSON.stringify(body));
assert.equal(typeof body.original, 'string');
assert.equal(typeof body.translated, 'string');
console.log('AI audio smoke test passed');
