// Real React/CSS in headless Chrome; synthetic transcript events and mocked
// capture/transport. No backend, AI, credentials, microphone or network service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireClient = createRequire(path.join(root, 'client/package.json'));
const { build } = requireClient('esbuild');
const output = path.join(root, '.tmp/transcript-reveal-browser');
await mkdir(output, { recursive: true });
const fixture = String.raw`
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import TranscriptText from './client/src/components/chat/TranscriptText.jsx';
import TranslationNotes from './client/src/components/chat/TranslationNotes.jsx';
import i18n from './client/src/i18n.js';
const check = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (condition, message) => {
    const start = performance.now();
    while (!condition()) { if (performance.now() - start > 2000) throw Error(message); await delay(10); }
};
const host = document.querySelector('#text');
const textRoot = createRoot(host);
const panelRoot = createRoot(document.querySelector('#root'));
let key = 0;
let callbacks = 0;
const revealed = () => callbacks++;
const render = (text, isFinal = false, extra = {}) => flushSync(() => textRoot.render(
    <StrictMode><div className="translation-msg-original"><TranscriptText key={key} text={text} isFinal={isFinal} onReveal={revealed} {...extra} /></div></StrictMode>
));
const visual = () => host.querySelector('.translation-transcript-visual');
const text = () => visual()?.textContent;
const settled = value => wait(() => text() === value, 'reveal did not settle: ' + value);
const cursor = () => host.querySelector('.translation-transcript-cursor');
const mount = value => { key++; render(value); };
globalThis.testSocket = { connected: true, id: 'viewer', on() {}, off() {} };
const track = Object.assign(new EventTarget(), { enabled: true, muted: false, readyState: 'live' });
const sources = [{ id: 'b'.repeat(24), stream: { getAudioTracks: () => [track] } }];
const renderPanel = sessionId => flushSync(() => panelRoot.render(<StrictMode><TranslationNotes active kind="direct" sessionId={sessionId} sources={sources} /></StrictMode>));
const emit = (original, utteranceId, revision = 1, isFinal = true) => flushSync(() => globalThis.feedEvent({
    type: 'transcript', streamId: 'stream', utteranceId, revision, original, isFinal,
    speakerId: 'b'.repeat(24), speakerName: 'Speaker', sourceLanguage: 'en', targetLanguage: 'vi', translate: false,
}));
window.runTranscriptChecks = async () => {
    const checks = [];
    mount('Hello there my friend');
    check(text() === 'Hello ', 'initial update appeared all at once');
    check(host.querySelector('.translation-transcript-accessible').textContent === 'Hello there my friend', 'accessible source text is incomplete');
    check(visual().getAttribute('aria-hidden') === 'true' && cursor(), 'accessible animation/cursor contract');
    await settled('Hello there my friend');
    const first = visual().children[0];
    render('Hello there my friend with more words');
    check(visual().children[0] === first && text() === 'Hello there my friend ', 'append replayed or replaced existing words');
    await settled('Hello there my friend with more words');
    checks.push('progressive append; stable DOM; accessible snapshot');

    mount('We like the small blue car'); await settled('We like the small blue car');
    const old = [...visual().children].slice(0, -1);
    render('We really like the small blue car today');
    check(text() === 'We really like the small blue car ', 'insertion replayed previously visible suffix');
    check(visual().children[2] === old[1] && visual().children[6] === old[5], 'correction remounted unchanged words');
    await settled('We really like the small blue car today');
    render('We like the small blue car today again');
    check(text() === 'We like the small blue car today ', 'deletion revealed new trailing words instantly');
    await settled('We like the small blue car today again');
    render('We like the small green car today again.', true);
    await settled('We like the small green car today again.');
    check(!cursor(), 'final cursor did not stop');
    checks.push('interim insertion/deletion/replacement; final punctuation');

    mount('One two three four five six seven eight nine ten');
    await delay(90);
    render('One two corrected', false);
    await settled('One two corrected');
    check(!text().includes('four'), 'obsolete queued text leaked after shortened interim');
    render('One two corrected and done', true);
    check(cursor(), 'final pending reveal lost cursor');
    await settled('One two corrected and done'); check(!cursor(), 'final cursor remains');
    checks.push('shortened interim during reveal; final while animating');

    mount('Start'); await settled('Start');
    const lengths = [];
    let latest = 'Start';
    for (let i = 0; i < 18; i++) {
        latest += ' word' + i; render(latest); await delay(20); lengths.push(text().length);
    }
    latest += ' ' + Array.from({ length: 180 }, (_, i) => 'burst' + i).join(' ');
    const start = performance.now(); render(latest, true); await settled(latest);
    check(lengths.at(-1) > lengths[0], 'continuous updates starved the timer');
    check(performance.now() - start < 1300, 'burst created a large animation backlog');
    check(text() === latest, 'burst duplicated/dropped words');
    checks.push('continuous updates; bounded catch-up for 199 words');

    mount('Xin chào, tôi đang nói tiếng Việt. 👋  repeated repeated\nnext line');
    await settled('Xin chào, tôi đang nói tiếng Việt. 👋  repeated repeated\nnext line');
    render('Xin chào, tôi đang nói tiếng Việt! 👋  repeated\nnext line done', true);
    await settled('Xin chào, tôi đang nói tiếng Việt! 👋  repeated\nnext line done');
    checks.push('Vietnamese; Unicode; repeated words; exact whitespace');

    mount('Stop during a very long unfinished reveal'); render('Stop during a very long unfinished reveal', true, { stopped: true });
    check(text() === 'Stop during a very long unfinished reveal' && !cursor(), 'interruption left pending text');
    mount('An unfinished reveal must flush when the tab becomes hidden');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    flushSync(() => document.dispatchEvent(new Event('visibilitychange')));
    check(text() === 'An unfinished reveal must flush when the tab becomes hidden', 'hidden tab retains backlog');
    delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));
    mount('Unmount while still animating a long phrase');
    flushSync(() => textRoot.render(null)); const count = callbacks; await delay(180);
    check(callbacks === count, 'unmount left an active reveal timer');
    key++; render('Historical notes appear immediately on reopen', true, { skipInitialAnimation: true });
    check(text() === 'Historical notes appear immediately on reopen', 'history replayed');
    checks.push('interruption; hidden tab; unmount cleanup; reopened history');
    return checks;
};
window.startMotionCheck = () => { mount('Reduced motion changed during a pending reveal with many words'); return text(); };
window.finishMotionCheck = () => {
    check(text() === 'Reduced motion changed during a pending reveal with many words', 'reduced motion did not flush pending text');
    check(getComputedStyle(cursor()).animationName === 'none', 'cursor blinks under reduced motion');
    render('New reduced motion text appears immediately', false);
    check(text() === 'New reduced motion text appears immediately', 'reduced motion added a delay');
    return 'live reduced-motion change; immediate updates; static cursor';
};
window.checkMotionRestored = () => {
    check([...visual().children].filter(node => !node.classList.contains('translation-transcript-cursor')).every(node => node.getAnimations().length === 0), 'restoring motion replayed old words');
    return 'restoring motion does not replay old words';
};
window.runPanelChecks = async () => {
    host.style.display = 'none';
    await i18n.changeLanguage('en'); renderPanel('session-1');
    document.querySelector('.translation-toggle').click(); await wait(() => globalThis.feedEvent, 'panel stream not ready');
    for (let i = 0; i < 16; i++) emit('Note ' + i + ': continuous speech remains in its own transcript row.', 'row' + i);
    const list = document.querySelector('.translation-list');
    await wait(() => list.querySelectorAll('.translation-transcript-visual').length === 16 && [...list.querySelectorAll('.translation-transcript-visual')].every((node, i) => node.textContent === 'Note ' + i + ': continuous speech remains in its own transcript row.'), 'rows did not settle');
    check(list.scrollHeight > list.clientHeight, 'scroll fixture did not overflow');
    check(list.scrollHeight - list.scrollTop - list.clientHeight < 3, 'feed did not follow revealed words');
    list.scrollTop = 0; list.dispatchEvent(new Event('scroll', { bubbles: true }));
    emit('New speech ' + 'long speech segment '.repeat(55), 'scrolling', 1, false); await delay(160);
    check(list.scrollTop === 0, 'feed pulled the reader away from history');
    list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll', { bubbles: true }));
    await wait(() => list.querySelectorAll('.translation-transcript-visual')[16].textContent.endsWith('long speech segment '), 'scroll reveal did not settle');
    check(list.scrollHeight - list.scrollTop - list.clientHeight < 3, 'feed failed to resume following');
    emit('Clear during another long reveal that should never come back after deletion', 'clear', 1, false); await delay(20);
    document.querySelector('.translation-action-btn').click(); await delay(180);
    check(!list.querySelector('.translation-msg-original'), 'cleared text reappeared from a timer');
    const original = 'The final transcript continues revealing while its translation arrives in the same note.';
    flushSync(() => globalThis.feedEvent({ type: 'transcript', streamId: 'stream', utteranceId: 'translated', revision: 1,
        original, isFinal: true, speakerId: 'b'.repeat(24), sourceLanguage: 'en', targetLanguage: 'vi' }));
    const firstWord = list.querySelector('.translation-transcript-visual').children[0];
    const select = document.querySelector('.translation-language-field select'); select.focus();
    flushSync(() => globalThis.feedEvent({ type: 'translation', streamId: 'stream', utteranceId: 'translated', revision: 1, translated: 'Bản dịch đến đúng dòng.' }));
    check(list.querySelector('.translation-msg-text').textContent === 'Bản dịch đến đúng dòng.', 'translation rendering changed');
    check(list.querySelector('.translation-transcript-visual').children[0] === firstWord && document.activeElement === select, 'translation reset reveal or keyboard focus');
    await wait(() => list.querySelector('.translation-transcript-visual').textContent === original, 'final original failed to finish after translation');
    document.querySelector('.translation-action-btn').click(); await delay(20);
    emit('Reopened history remains readable immediately without animation replay.', 'history'); await delay(1000);
    document.querySelector('.translation-close-btn').click(); await delay(20);
    document.querySelector('.translation-toggle').click(); await delay(20);
    check(document.querySelector('.translation-list .translation-transcript-visual').textContent === 'Reopened history remains readable immediately without animation replay.', 'panel replayed history');
    renderPanel('session-2'); await delay(30);
    check(!document.querySelector('.translation-panel'), 'session reset kept the old panel');
    document.querySelector('.translation-toggle').click(); await delay(30);
    check(!document.querySelector('.translation-list .translation-msg-original'), 'session reset leaked old text');
    emit('The transcript now reveals words smoothly while keeping the existing layout.', 'visual', 1, false);
    await delay(1000);
    return ['panel follows rendered words; manual scroll preserved; follow resumes', 'translation arrival preserves original reveal and keyboard focus', 'clear during animation; history reopen; session reset'];
};
window.fixtureReady = true;
`;
const mocks = {
    auth: `export const useAuthStore=()=>({user:{_id:'a'.repeat(24)},socket:globalThis.testSocket});`,
    api: `export default {get:async()=>({data:{status:'ready'}})};`,
    capture: `export const createPcmAudioContext=()=>({state:'running',audioWorklet:{addModule:async()=>{}},resume:async()=>{},close:async()=>{}});export const createPcmCapture=()=>({stop(){}});`,
    transport: `export const createTranslationPcmSocket=({onEvent,onReady})=>{globalThis.feedEvent=onEvent;queueMicrotask(()=>onReady('stream'));return {send(){},stop(){}}};`,
    worklet: `export default '';`,
};
await build({ stdin: { contents: fixture, resolveDir: root, loader: 'jsx' }, bundle: true, format: 'esm', jsx: 'automatic',
    outfile: path.join(output, 'fixture.js'), nodePaths: [path.join(root, 'client/node_modules')],
    plugins: [{ name: 'transcript-fixture', setup(b) {
        b.onResolve({ filter: /useAuthStore|lib\/axios\.js|translationPcmCapture\.js|translationPcmSocket\.js/ }, args => ({
            path: args.path.includes('useAuthStore') ? 'auth' : args.path.includes('axios') ? 'api' : args.path.includes('Capture') ? 'capture' : 'transport', namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
        b.onResolve({ filter: /translationPcmWorklet\.js\?url$/ }, () => ({ path: 'worklet', namespace: 'fixture' }));
    } }],
});
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>
*{box-sizing:border-box}body{margin:0;font:14px Arial,sans-serif;background:var(--primary-blockBackgroundColor);color:var(--primary-textColor)}#text{position:absolute;left:16px;top:16px;max-width:300px}#root{position:relative;height:100vh}:root{--primary-textColor:#e7e9ea;--primary-blockBackgroundColor:#000;--primary-borderColor:#444;--surface-subtle:#16181c;--text-muted:#aaa;--accent-text:#f97316;--primary-hoverBackgroundColor:#252525}
</style></head><body><div id="text"></div><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`;
const http = createServer(async (req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const files = { '/fixture.js': 'text/javascript', '/fixture.css': 'text/css' };
    if (!files[req.url]) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', files[req.url]); res.end(await readFile(path.join(output, req.url.slice(1))));
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const profile = path.join(output, `chrome-${Date.now()}`);
const chrome = spawn(process.env.TRANSCRIPT_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--disable-background-networking', `http://127.0.0.1:${http.address().port}/`,
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.on('error', error => { chromeError += error.message; });
chrome.stderr.on('data', data => { chromeError += data.toString(); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
    }
    assert.ok(port, 'Chrome did not start: ' + chromeError);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const value = JSON.parse(event.data);
        if (value.id) { pending.get(value.id)?.(value); pending.delete(value.id); }
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, value => value.error ? reject(value.error) : resolve(value.result));
        socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    for (let i = 0; i < 100 && !await evaluate('window.fixtureReady'); i++) await delay(50);
    assert.equal(await evaluate('window.fixtureReady'), true, 'fixture did not load');
    const checks = await evaluate('window.runTranscriptChecks()');
    await evaluate('window.startMotionCheck()');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await delay(50); checks.push(await evaluate('window.finishMotionCheck()'));
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await delay(50); checks.push(await evaluate('window.checkMotionRestored()'));
    checks.push(...await evaluate('window.runPanelChecks()'));
    const screenshots = [];
    for (const [name, width, height, color] of [['desktop-dark', 1280, 900, '#f97316'], ['mobile-light', 390, 844, '#2563eb'], ['mobile-custom', 390, 844, '#a855f7']]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        if (name === 'mobile-light') await evaluate(`document.documentElement.style.cssText='--primary-textColor:#15202b;--primary-blockBackgroundColor:#fff;--primary-borderColor:#ccd0d5;--surface-subtle:#f2f4f6;--text-muted:#596575'`);
        await evaluate(`document.documentElement.style.setProperty('--accent-text', '${color}')`);
        await delay(100);
        const layout = await evaluate(`(()=>{const p=document.querySelector('.translation-panel'),r=p.getBoundingClientRect(),t=p.querySelector('.translation-msg-original');return {left:r.left,right:r.right,viewport:innerWidth,overflow:p.scrollWidth>p.clientWidth,textOverflow:t.scrollWidth>t.clientWidth,cursorColor:getComputedStyle(p.querySelector('.translation-transcript-cursor')).backgroundColor,textColor:getComputedStyle(t).color}})()`);
        assert.ok(layout.left >= 0 && layout.right <= layout.viewport && !layout.overflow && !layout.textOverflow, JSON.stringify(layout));
        assert.equal(layout.cursorColor, layout.textColor);
        await writeFile(path.join(output, `${name}.png`), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        screenshots.push({ name, ...layout });
    }
    const result = { status: 'passed', checks, screenshots, scope: 'Synthetic transcripts; mocked capture/transport/health. Real React, CSS, timers and browser scrolling; no backend/AI/device acceptance.' };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    socket?.close(); chrome.kill(); http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
    await delay(300);
    assert.ok(path.resolve(profile).startsWith(path.resolve(output) + path.sep) && /^chrome-\d+$/.test(path.basename(profile)));
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
