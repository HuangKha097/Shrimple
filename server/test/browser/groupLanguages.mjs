// Real group store, modal, React and AudioWorklet; synthetic audio and fake signaling/AI.
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
const sass = requireClient('sass');
const output = path.join(root, '.tmp/group-language-browser');
await mkdir(output, { recursive: true });
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import GroupCallModal from './client/src/components/chat/GroupCallModal.jsx';
import {useGroupCallStore} from './client/src/stores/useGroupCallStore.js';
import './client/src/i18n.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(value,message)=>{if(!value)throw Error(message)};
const wait=async(predicate,message)=>{for(let i=0;i<120;i++){if(predicate())return;await delay(50)}throw Error(message)};
const self='a'.repeat(24),bob='b'.repeat(24),carol='c'.repeat(24),room='d'.repeat(24);
const contexts=[],captures=[],requests=[],stops=[],packets=new Map(),handlers=new Map();
const synth=()=>{const c=new AudioContext();contexts.push(c);const o=c.createOscillator(),d=c.createMediaStreamDestination();o.connect(d);o.start();return d.stream};
globalThis.remoteStreams=[synth(),synth()];
navigator.mediaDevices.getUserMedia=async()=>{const s=synth();captures.push(s);return s};
let selfMember,joinCount=0;
const member=(id,socketId,spokenLanguage)=>({userId:id,socketId,name:socketId,spokenLanguage,languageRevision:0,attendanceId:id});
let remoteMembers=[member(bob,'bob','en'),member(carol,'carol','vi')];
globalThis.testSocket={id:'alice',connected:true,on(e,h){if(!handlers.has(e))handlers.set(e,new Set());handlers.get(e).add(h)},
off(e,h){if(h)handlers.get(e)?.delete(h);else handlers.delete(e)},receive(e,d){for(const h of handlers.get(e)||[])h(d)},
timeout(){return {emit:(e,d,ack)=>this.emit(e,d,answer=>ack(null,answer))}},
emit(e,d,ack){
 if(e==='joinGroupCall'){selfMember={...member(self,'alice',d.spokenLanguage),attendanceId:(++joinCount).toString().padStart(24,'0')};
  queueMicrotask(()=>this.receive('groupCallExistingUsers',{conversationId:room,callId:'f'.repeat(24),self:selfMember,participants:remoteMembers}))}
 if(e==='groupCallSetLanguage'){selfMember={...selfMember,spokenLanguage:d.spokenLanguage,languageRevision:selfMember.languageRevision+1};
  queueMicrotask(()=>{this.receive('groupCallLanguageChanged',{conversationId:room,callId:'f'.repeat(24),participant:selfMember});ack({ok:true,participant:selfMember})})}
 if(e==='translation:start'){const streamId='group-'+requests.length;requests.push({...d,streamId});queueMicrotask(()=>ack({ok:true,streamId,sampleRate:16000,channels:1,packetSamples:2048}))}
 if(e==='translation:audio'){packets.set(d.streamId,(packets.get(d.streamId)||0)+1);queueMicrotask(()=>ack({ok:true}))}
 if(e==='translation:stop')stops.push(d.streamId);
}};
const latest=id=>requests.filter(r=>r.speakerId===id).at(-1);
const emit=(request,text,utteranceId='u1')=>testSocket.receive('translation:event',{type:'transcript',streamId:request.streamId,speakerId:request.speakerId,
 speakerSocketId:request.speakerSocketId,speakerName:request.speakerSocketId,sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,
 translate:request.translate,utteranceId,revision:1,original:text,isFinal:true});
const change=(select,value)=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))};
createRoot(document.getElementById('root')).render(<React.StrictMode><GroupCallModal/></React.StrictMode>);
useGroupCallStore.getState().subscribeToGroupCallEvents();
try{
 await delay(100);await useGroupCallStore.getState().joinGroupCall(room,{name:'Mixed-language group'});
 await wait(()=>document.querySelector('.translation-toggle'),'group UI');
 check(document.querySelector('[class*="spoken-language"] select'),'spoken language missing while Note closed');
 document.querySelector('.translation-toggle').click();
 await wait(()=>requests.length===3,'three separate speaker streams');
 await wait(()=>[self,bob,carol].every(id=>packets.get(latest(id).streamId)>0),'three real AudioWorklet captures');
 check(latest(bob).sourceLanguage==='en'&&latest(bob).targetLanguage==='vi','Bob ASR source wrong');
 check(latest(carol).sourceLanguage==='vi'&&latest(carol).translate===false,'same-language Carol must bypass MT');
 emit(latest(carol),'Lời Carol.');emit(latest(bob),'Bob speaking.');emit(latest(self),'Lời Alice.');
 testSocket.receive('translation:event',{type:'translation',streamId:latest(bob).streamId,speakerId:bob,utteranceId:'u1',revision:1,translated:'Lời Bob.'});
 await wait(()=>document.querySelectorAll('.translation-msg-wrapper').length===3,'interleaved notes');
 check([...document.querySelectorAll('.other .translation-msg-original')].some(n=>n.textContent==='Lời Carol.'),'same-language peer mislabeled as self');
 check(document.querySelectorAll('.other .translation-msg-translated-block').length===1,'same-language peer created translation block');
 const beforeTarget=requests.slice(-3);change(document.querySelector('.translation-language-field select'),'en');
 await wait(()=>requests.length===6,'reader target restart');
 check(beforeTarget.every(r=>stops.includes(r.streamId)),'target change leaked old streams');
 check(latest(self).sourceLanguage==='vi'&&latest(self).targetLanguage==='en','reader target changed spoken language');
 check(latest(bob).translate===false&&latest(carol).targetLanguage==='en','per-reader routing wrong');
 const oldBob=latest(bob);remoteMembers[0]={...remoteMembers[0],spokenLanguage:'vi',languageRevision:1};
 testSocket.receive('groupCallLanguageChanged',{conversationId:room,callId:'f'.repeat(24),participant:remoteMembers[0]});
 await wait(()=>latest(bob).streamId!==oldBob.streamId,'speaker declaration restart');
 check(stops.includes(oldBob.streamId)&&latest(bob).sourceLanguage==='vi','old speaker stream survived');
 emit(oldBob,'STALE LANGUAGE RESULT','late');await delay(60);
 check(!document.body.innerText.includes('STALE LANGUAGE RESULT'),'late old-language result leaked');
 change(document.querySelector('[class*="spoken-language"] select'),'en');
 await wait(()=>latest(self).sourceLanguage==='en','own spoken language propagated');
 check(latest(self).translate===false,'own same-language stream did not bypass MT');
 const oldCarol=latest(carol);testSocket.receive('groupCallUserLeft',{socketId:'carol'});
 await wait(()=>stops.includes(oldCarol.streamId),'departed source cleanup');
 const packetCount=packets.get(oldCarol.streamId)||0;await delay(300);
 check((packets.get(oldCarol.streamId)||0)===packetCount,'departed speaker still uploads PCM');
 emit(oldCarol,'STALE LEFT RESULT','late');await delay(50);check(!document.body.innerText.includes('STALE LEFT RESULT'),'departed result leaked');
 window.browserTest={status:'visualReady',translationStarts:requests.length};
 await wait(()=>window.continueTest,'screenshot handoff');
 const oldSelf=latest(self);useGroupCallStore.getState().leaveGroupCall();await delay(80);
 check(captures[0].getAudioTracks()[0].readyState==='ended','leave kept microphone alive');
 emit(oldSelf,'STALE ROOM RESULT','late');
 globalThis.peerIndex=0;await useGroupCallStore.getState().joinGroupCall(room,{name:'Rejoined group'});
 await wait(()=>document.querySelector('.translation-toggle'),'rejoined UI');document.querySelector('.translation-toggle').click();
 await wait(()=>latest(self).viewerAttendanceId!==oldSelf.viewerAttendanceId,'fresh attendance after rejoin');
 check(!document.body.innerText.includes('STALE ROOM RESULT'),'old room note leaked into rejoin');
 testSocket.connected=false;testSocket.receive('disconnect');await delay(80);
 check(!useGroupCallStore.getState().isInCall&&captures[1].getAudioTracks()[0].readyState==='ended','disconnect leaked group capture');
 testSocket.connected=true;let releaseMedia;
 navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{releaseMedia=resolve});
 const pendingJoin=useGroupCallStore.getState().joinGroupCall(room,{name:'Canceled permission'});
 useGroupCallStore.getState().leaveGroupCall();
 const lateMedia=synth();captures.push(lateMedia);releaseMedia(lateMedia);await pendingJoin;
 check(!useGroupCallStore.getState().isInCall&&lateMedia.getAudioTracks()[0].readyState==='ended','late permission revived a canceled room');
 await Promise.all(contexts.map(c=>c.close()));
 window.browserTest={status:'passed',speakers:3,translationStarts:requests.length,realWorkletPackets:[...packets.values()].reduce((a,b)=>a+b,0),microphoneAcquisitions:captures.length};
}catch(error){window.browserTest={status:'failed',error:error.stack,text:document.body.innerText,requests}};
`;
const mocks = {
    auth: `export const useAuthStore=()=>({user:{_id:'a'.repeat(24),displayName:'Alice'},socket:globalThis.testSocket});useAuthStore.getState=useAuthStore;`,
    chat: `export const useChatStore=()=>({conversations:[]});`,
    api: `export default {get:async()=>({data:{status:'ready'}})};`,
    chatService: `export const chatService={};`,
    add: `export default ()=>null;`,
    peer: `export default class Peer{constructor(){this.handlers=new Map();const index=(globalThis.peerIndex||0)%2;globalThis.peerIndex=index+1;queueMicrotask(()=>this.emit('stream',globalThis.remoteStreams[index]))}on(e,h){if(!this.handlers.has(e))this.handlers.set(e,[]);this.handlers.get(e).push(h)}emit(e,d){for(const h of this.handlers.get(e)||[])h(d)}signal(){}destroy(){this.destroyed=true}}`,
};
await build({ stdin: { contents: fixture, resolveDir: root, loader: 'jsx' }, bundle: true, format: 'esm', jsx: 'automatic',
    outfile: path.join(output, 'fixture.js'), nodePaths: [path.join(root, 'client/node_modules')], define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'isolated-group-fixture', setup(b) {
        b.onResolve({ filter: /useAuthStore|useChatStore|lib\/axios\.js|services\/chatService|AddMemberModal\.jsx|^simple-peer$/ }, args => ({
            path: args.path.includes('useAuthStore') ? 'auth' : args.path.includes('useChatStore') ? 'chat' : args.path.includes('chatService') ? 'chatService' :
                args.path.includes('AddMemberModal') ? 'add' : args.path === 'simple-peer' ? 'peer' : 'api', namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
        b.onResolve({ filter: /translationPcmWorklet\.js\?url$/ }, () => ({ path: 'worklet', namespace: 'worklet' }));
        b.onLoad({ filter: /.*/, namespace: 'worklet' }, () => ({ contents: `export default '/worklet.js'`, loader: 'js' }));
        b.onLoad({ filter: /\.module\.scss$/ }, args => ({ contents: sass.compile(args.path).css, loader: 'local-css' }));
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
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--disable-background-networking', `http://127.0.0.1:${http.address().port}/`,
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
        const layout = await evaluate(`(()=>{const p=document.querySelector('.translation-panel'),r=p.getBoundingClientRect(),d=document.querySelector('[class*="call-dock"]').getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,selects:p.querySelectorAll('select').length,overflow:p.scrollWidth>p.clientWidth,dockTop:d.top,dockBottom:d.bottom,panelBottom:r.bottom,height:innerHeight}})()`);
        assert.equal(layout.selects, 1);
        assert.ok(layout.left >= 0 && layout.right <= width && !layout.overflow && layout.dockBottom <= height, JSON.stringify(layout));
        assert.ok(layout.panelBottom <= layout.dockTop, 'notes cover spoken language/mute/end controls');
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
    const result = { ...state, screenshots, scope: 'Synthetic audio with real group store/modal/React/MediaStream/AudioWorklet; mocked signaling/AI/WebRTC. Real mic, networks and ASR/MT quality unverified.' };
    await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    socket?.close();
    chrome.kill();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
    await delay(300);
    assert.ok(path.resolve(profile).startsWith(path.resolve(output) + path.sep) && /^chrome-\d+$/.test(path.basename(profile)));
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
}
