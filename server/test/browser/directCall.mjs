// Browser regression with real React, MediaStream and AudioWorklet; synthetic audio,
// fake signaling/AI. Does not log in, read .env, use a real mic or contact services.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireClient = createRequire(path.join(root, 'client/package.json'));
const { build } = requireClient('esbuild');
const output = path.join(root, '.tmp/direct-call-browser');
await mkdir(output, { recursive: true });
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import CallModal from './client/src/components/chat/CallModal.jsx';
import {useCallStore} from './client/src/stores/useCallStore.js';
import './client/src/i18n.js';
const check=(value,message)=>{if(!value) throw Error(message)};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(predicate,message)=>{for(let i=0;i<100;i++){if(predicate())return;await delay(50)}throw Error(message)};
const self='a'.repeat(24),remote='b'.repeat(24),peers=[];
const contexts=[],captures=[];
const synth=()=>{const c=new AudioContext();contexts.push(c);const o=c.createOscillator();o.frequency.value=440;const dest=c.createMediaStreamDestination();o.connect(dest);o.start();return dest.stream};
globalThis.remoteTestStream=synth();
navigator.mediaDevices.getUserMedia=async()=>{const stream=synth();captures.push(stream);return stream};
const handlers=new Map(),requests=[],packets=new Map(),stops=[];
globalThis.testPeers=peers;
globalThis.testSocket={connected:true,on(e,h){if(!handlers.has(e))handlers.set(e,new Set());handlers.get(e).add(h)},off(e,h){if(h)handlers.get(e)?.delete(h);else handlers.delete(e)},
 receive(e,d){for(const h of handlers.get(e)||[])h(d)},emit(e,d,ack){
 if(e==='translation:start'){const streamId='test-'+requests.length;requests.push({...d,streamId});queueMicrotask(()=>ack({ok:true,streamId,sampleRate:16000,channels:1,packetSamples:2048}))}
 if(e==='translation:audio'){packets.set(d.streamId,(packets.get(d.streamId)||0)+1);queueMicrotask(()=>ack({ok:true}))}
 if(e==='translation:stop')stops.push(d.streamId);
 }};
createRoot(document.getElementById('root')).render(<React.StrictMode><CallModal/></React.StrictMode>);
useCallStore.getState().subscribeToCallEvents();
const incoming=()=>useCallStore.getState().setCallIncoming({from:remote,name:'Remote fixture',signal:{type:'offer'}});
const latest=id=>requests.filter(r=>r.speakerId===id).at(-1);
try{
 // The app mounts CallModal while idle; let StrictMode finish that idle mount
 // before delivering the incoming event, just as the real socket does.
 await delay(100);
 incoming();await wait(()=>document.querySelector('button')?.textContent.includes('Trả lời'),'incoming UI');
 check(captures.length===0,'ringing opened mic');
 document.querySelector('button').click();
 await wait(()=>document.querySelector('[aria-label="Tắt micro"]'),'accepted UI');
 check(captures.length===1&&peers.length===1,'accept acquired extra stream/peer');
 check(peers[0].config.stream===captures[0],'peer uses a different microphone');
 document.querySelector('.translation-toggle').click();
 await wait(()=>requests.length===2,'both translation sources start');
 await wait(()=>packets.get(latest(self).streamId)>0&&packets.get(latest(remote).streamId)>0,'real AudioWorklet packets');
 const sourceSelect=document.querySelectorAll('.translation-language-field select')[0];
 sourceSelect.value='vi';sourceSelect.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>requests.length>=4,'direction restarted sources');
 check(latest(remote).sourceLanguage==='vi'&&latest(remote).targetLanguage==='en','remote direction inverted');
 check(latest(self).sourceLanguage==='vi'&&latest(self).targetLanguage==='vi'&&latest(self).translate===false,'translation target changed viewer spoken language');
 const emit=(id,text)=>{const r=latest(id);testSocket.receive('translation:event',{type:'transcript',streamId:r.streamId,speakerId:id,speakerName:id===self?'Self fixture':'Remote fixture',sourceLanguage:r.sourceLanguage,targetLanguage:r.targetLanguage,translate:r.translate,utteranceId:'u1',revision:1,original:text,isFinal:true})};
 emit(self,'Tôi là người nhận cuộc gọi.');emit(remote,'Tôi là người gọi.');
 testSocket.receive('translation:event',{type:'translation',streamId:latest(remote).streamId,speakerId:remote,utteranceId:'u1',revision:1,translated:'I am the caller.'});
 await wait(()=>document.querySelector('.other .translation-msg-text')?.textContent==='I am the caller.','translated remote note');
 check(document.querySelector('.self .translation-msg-original')?.textContent==='Tôi là người nhận cuộc gọi.','self and remote mixed');
 document.querySelector('[aria-label="Tắt micro"]').click();
 check(captures[0].getAudioTracks()[0].enabled===false,'peer microphone remains enabled');
 await wait(()=>stops.includes(latest(self).streamId),'self capture stop');
 const stoppedSelf=latest(self).streamId,before=packets.get(stoppedSelf)||0;
 await delay(350);check((packets.get(stoppedSelf)||0)===before,'muted self still uploads PCM');
 testSocket.receive('callMediaState',{from:remote,isMuted:true});
 await wait(()=>stops.includes(latest(remote).streamId),'remote capture stop');
 const stoppedRemote=latest(remote).streamId,remoteBefore=packets.get(stoppedRemote)||0;
 await delay(350);check((packets.get(stoppedRemote)||0)===remoteBefore,'muted remote still uploads PCM');
 document.querySelector('[aria-label="Bật micro"]').click();
 await wait(()=>latest(self).streamId!==stoppedSelf&&packets.get(latest(self).streamId)>0,'unmute capture resumed');
 check(captures.length===1,'unmute acquired another mic');
 window.browserTest={status:'visualReady',captures:captures.length,peers:peers.length,requests:requests.length};
 await wait(()=>window.continueTest,'screenshot handoff');
 testSocket.receive('endCall');
 await wait(()=>!document.querySelector('[aria-label="Tắt micro"]'),'ended UI');
 check(captures[0].getAudioTracks()[0].readyState==='ended'&&peers[0].destroyed,'remote end leaked mic/peer');
 incoming();await wait(()=>document.querySelector('button')?.textContent.includes('Trả lời'),'second incoming');
 check(captures.length===1,'second ring opened mic');document.querySelector('button').click();
 await wait(()=>document.querySelector('[aria-label="Tắt micro"]'),'second accepted');
 check(captures.length===2&&captures[1].getAudioTracks()[0].enabled,'second call inherited stale muted stream');
 useCallStore.getState().setCallEnded();await delay(50);
 await Promise.all(contexts.map(c=>c.close()));
 window.browserTest={status:'passed',microphoneAcquisitions:captures.length,peers:peers.length,translationStarts:requests.length,realWorkletPackets:[...packets.values()].reduce((a,b)=>a+b,0)};
}catch(error){window.browserTest={status:'failed',error:error.stack,captures:captures.length,peers:peers.length,text:document.body.innerText,callId:useCallStore.getState().callId}};
`;
const mocks = {
    auth: `export const useAuthStore=()=>({user:{_id:'a'.repeat(24),displayName:'Self fixture'},socket:globalThis.testSocket});useAuthStore.getState=useAuthStore;`,
    api: `export default {get:async()=>({data:{status:'ready'}})};`,
    peer: `export default class Peer{constructor(config){this.config=config;this.handlers=new Map();globalThis.testPeers.push(this)}on(e,h){if(!this.handlers.has(e))this.handlers.set(e,[]);this.handlers.get(e).push(h)}emit(e,d){for(const h of this.handlers.get(e)||[])h(d)}signal(){queueMicrotask(()=>{this.emit('signal',{type:'answer'});this.emit('stream',globalThis.remoteTestStream);this.emit('connect')})}destroy(){this.destroyed=true;this.emit('close')}}`,
};
await build({ stdin: { contents: fixture, resolveDir: root, loader: 'jsx' }, bundle: true, format: 'esm',
    jsx: 'automatic', outfile: path.join(output, 'fixture.js'), nodePaths: [path.join(root, 'client/node_modules')],
    plugins: [{ name: 'isolated-call-fixture', setup(b) {
        b.onResolve({ filter: /useAuthStore|lib\/axios\.js|^simple-peer$/ }, args => ({
            path: args.path.includes('useAuthStore') ? 'auth' : args.path === 'simple-peer' ? 'peer' : 'api', namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
        b.onResolve({ filter: /translationPcmWorklet\.js\?url$/ }, () => ({ path: 'worklet', namespace: 'fixture-worklet' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture-worklet' }, () => ({ contents: `export default '/worklet.js'`, loader: 'js' }));
    } }],
});
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}:root{--primary-textColor:#e7e9ea;--primary-blockBackgroundColor:#000;--primary-borderColor:#444;--surface-subtle:#16181c;--text-muted:#aaa;--accent-text:#f97316;--primary-hoverBackgroundColor:#252525}
</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`;
const http = createServer(async (req, res) => {
    const name = req.url?.split('?')[0];
    const files = { '/fixture.js': [path.join(output, 'fixture.js'), 'text/javascript'], '/fixture.css': [path.join(output, 'fixture.css'), 'text/css'],
        '/worklet.js': [path.join(root, 'client/src/components/chat/translationPcmWorklet.js'), 'text/javascript'] };
    if (name === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (!files[name]) { res.writeHead(404); res.end(); return; }
    try { res.setHeader('Content-Type', files[name][1]); res.end(await readFile(files[name][0])); }
    catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const profile = path.join(output, `chrome-${Date.now()}`);
const chrome = spawn(process.env.DIRECT_CALL_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--disable-background-networking',
    `http://127.0.0.1:${http.address().port}/`,
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
    }
    assert.ok(port, 'headless Chrome did not start');
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
    const evaluate = async expression => (await cdp('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    let state;
    for (let i = 0; i < 200; i++) {
        state = await evaluate('window.browserTest');
        if (state) break;
        await delay(100);
    }
    assert.equal(state?.status, 'visualReady', JSON.stringify(state));
    const screenshots = [];
    for (const [name, width, height, theme] of [['desktop-dark', 1280, 900, 'dark'], ['mobile-light', 390, 844, 'light']]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        if (theme === 'light') await evaluate(`document.documentElement.style.cssText='--primary-textColor:#15202b;--primary-blockBackgroundColor:#fff;--primary-borderColor:#ccd0d5;--surface-subtle:#f2f4f6;--text-muted:#596575;--accent-text:#1d9bf0'`);
        await delay(100);
        const layout = await evaluate(`(()=>{const p=document.querySelector('.translation-panel'),r=p.getBoundingClientRect(),controls=document.querySelector('.direct-call-controls').getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,viewport:innerWidth,selects:p.querySelectorAll('select').length,overflow:p.scrollWidth>p.clientWidth,controlsTop:controls.top,panelBottom:r.bottom}})()`);
        assert.equal(layout.selects, 3);
        assert.ok(layout.left >= 0 && layout.right <= layout.viewport && !layout.overflow, JSON.stringify(layout));
        if (width < 500) assert.ok(layout.controlsTop >= layout.panelBottom, 'mobile notes cover mute/end controls');
        const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(output, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
        screenshots.push({ name, ...layout });
    }
    await evaluate('window.continueTest=true');
    for (let i = 0; i < 100; i++) {
        state = await evaluate('window.browserTest');
        if (state.status !== 'visualReady') break;
        await delay(100);
    }
    assert.equal(state.status, 'passed', JSON.stringify(state));
    const result = { ...state, screenshots, scope: 'Synthetic audio, real React/MediaStream/AudioWorklet; mocked peer/signaling/AI. No real mic/WebRTC/model quality acceptance.' };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    socket?.close();
    chrome.kill();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
    // Only remove this run's isolated browser profile, never a user profile.
    await delay(300);
    assert.ok(path.resolve(profile).startsWith(path.resolve(output) + path.sep) && /^chrome-\d+$/.test(path.basename(profile)));
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
