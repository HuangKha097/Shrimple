// Real Socket.IO, simple-peer, RTCPeerConnection, React and video frames on localhost.
// Capture is synthetic; database lookups are isolated fixtures. No .env or real devices.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.tmp/group-screen-share');
const requireClient = createRequire(path.join(root, 'client/package.json'));
const { build } = requireClient('esbuild');
const sass = requireClient('sass');
await mkdir(output, { recursive: true });
process.env.DOTENV_CONFIG_PATH = path.join(output, 'no-test-env');
process.env.ACCESS_TOKEN_SECRET = 'isolated-group-screen-share-test-key';
const { app, io, server } = await import('../../src/socket/socket.js');
const ids = ['a', 'b', 'c'].map(s => s.repeat(24));
const room = 'd'.repeat(24);
const conversation = { _id: room, isGroup: true, participants: ids.map(userId => ({ userId })),
    group: { name: 'Screen share regression' }, set() {}, save: async () => {} };
const message = { _id: 'f'.repeat(24), senderId: ids[0], createdAt: new Date(), content: 'fixture', messageType: 'group_call' };
const originals = [User.findById, Conversation.findById, Conversation.exists, Message.create, Message.findById, Message.deleteOne, Conversation.find];
User.findById = id => ({ select: async () => ({ _id: id, displayName: ['Alice', 'Bob', 'Carol'][ids.indexOf(id)] }) });
Conversation.findById = () => ({ then: resolve => Promise.resolve(conversation).then(resolve), select: async () => conversation });
Conversation.exists = async () => false;
Conversation.find = () => ({ select: async () => [conversation] });
Message.create = async () => message;
Message.findById = () => ({ populate: async () => message });
Message.deleteOne = async () => {};

const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {io} from 'socket.io-client';
import GroupCallModal from './client/src/components/chat/GroupCallModal.jsx';
import {useGroupCallStore} from './client/src/stores/useGroupCallStore.js';
import './client/src/i18n.js';
globalThis.fixtureErrors=[];globalThis.fixturePeers=[];
window.addEventListener('error',event=>fixtureErrors.push(event.message));
window.addEventListener('unhandledrejection',event=>fixtureErrors.push(String(event.reason)));
const cfg=globalThis.fixtureConfig;
globalThis.fixtureSocket=io({transports:['websocket'],reconnection:false,auth:{token:cfg.token}});
const captures=[],contexts=[],timers=[];
const video=colour=>{const c=document.createElement('canvas');c.width=320;c.height=180;
 const draw=()=>{const ctx=c.getContext('2d');ctx.fillStyle=colour;ctx.fillRect(0,0,320,180)};
 draw();timers.push(setInterval(draw,80));const s=c.captureStream(12);captures.push(s);return s};
const mic=()=>{const c=new AudioContext();contexts.push(c);const oscillator=c.createOscillator();
 const gain=c.createGain();gain.gain.value=0.01;const dest=c.createMediaStreamDestination();
 oscillator.connect(gain).connect(dest);oscillator.start();captures.push(dest.stream);return dest.stream};
navigator.mediaDevices.getUserMedia=async options=>options.video?video('#e02020'):mic();
navigator.mediaDevices.getDisplayMedia=async()=>video('#20d040');
globalThis.fixture={store:useGroupCallStore,video,captures,join:()=>useGroupCallStore.getState().joinGroupCall('${room}',{name:'Screen share regression'}),
 colour(){const sid=parent.frames.alice.fixtureSocket.id;const s=useGroupCallStore.getState().peers[sid]?.stream;
  const v=[...document.querySelectorAll('video')].find(el=>el.srcObject===s&&el.videoWidth>0);
  if(!v)return null;const c=document.createElement('canvas');c.width=c.height=1;
  c.getContext('2d').drawImage(v,0,0,1,1);return [...c.getContext('2d').getImageData(0,0,1,1).data]},
 async cleanup(){useGroupCallStore.getState().leaveGroupCall();useGroupCallStore.getState().unsubscribeFromGroupCallEvents();
  captures.forEach(s=>s.getTracks().forEach(t=>t.stop()));timers.forEach(clearInterval);fixtureSocket.disconnect();await Promise.all(contexts.map(c=>c.close()))}
};
createRoot(document.getElementById('root')).render(<GroupCallModal/>);
fixtureSocket.on('connect',()=>{useGroupCallStore.getState().subscribeToGroupCallEvents();globalThis.fixtureReady=true});
`;
const mocks = {
    auth: `export const useAuthStore=()=>({user:globalThis.fixtureConfig.user,socket:globalThis.fixtureSocket});useAuthStore.getState=useAuthStore;`,
    chat: `export const useChatStore=()=>({conversations:[]});`,
    api: `export default {get:async()=>({data:{status:'ready'}})};`,
    service: `export const chatService={};`,
    add: `export default ()=>null;`,
    peer: `import Peer from ${JSON.stringify(requireClient.resolve('simple-peer').replaceAll('\\', '/'))};
     export default class RecordedPeer extends Peer {constructor(options){super({...options,config:{iceServers:[]}});
      globalThis.fixturePeers.push(this);this.on('error',e=>globalThis.fixtureErrors.push(e.message))}}`,
};
await writeFile(path.join(output, 'shim.js'), `import process from ${JSON.stringify(requireClient.resolve('process/browser').replaceAll('\\', '/'))};export {process};`);
await build({ stdin: { contents: fixture, resolveDir: root, loader: 'jsx' }, bundle: true, format: 'esm', jsx: 'automatic',
    outfile: path.join(output, 'fixture.js'), nodePaths: [path.join(root, 'client/node_modules')],
    define: { 'import.meta.env': '{}', global: 'globalThis' }, inject: [path.join(output, 'shim.js')],
    plugins: [{ name: 'isolated-screen-share', setup(b) {
        b.onResolve({ filter: /useAuthStore|useChatStore|lib\/axios\.js|services\/chatService|AddMemberModal\.jsx|^simple-peer$/ }, args => ({
            path: args.path.includes('useAuthStore') ? 'auth' : args.path.includes('useChatStore') ? 'chat' : args.path.includes('chatService') ? 'service' :
                args.path.includes('AddMemberModal') ? 'add' : args.path === 'simple-peer' ? 'peer' : 'api', namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: root }));
        b.onResolve({ filter: /translationPcmWorklet\.js\?url$/ }, () => ({ path: 'worklet', namespace: 'fixture-worklet' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture-worklet' }, () => ({ contents: `export default '/worklet.js'`, loader: 'js' }));
        b.onLoad({ filter: /\.module\.scss$/ }, args => ({ contents: sass.compile(args.path).css, loader: 'local-css' }));
    } }],
});
const names = ['alice', 'bob', 'carol'];
const styles = `*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}:root{--primary-textColor:#e7e9ea;--primary-blockBackgroundColor:#000;--primary-borderColor:#444;--surface-subtle:#16181c;--text-muted:#aaa;--accent-text:#f97316;--primary-hoverBackgroundColor:#252525}`;
app.get('/', (_req, res) => res.send(`<!doctype html><html><body style="margin:0">${names.map(n => `<iframe name="${n}" src="/participant/${n}" style="position:absolute;top:0;left:${n==='carol'?0:1500}px;width:1280px;height:900px;border:0"></iframe>`).join('')}</body></html>`));
app.get('/participant/:name', (req, res) => {
    const i = names.indexOf(req.params.name);
    if (i < 0) return res.sendStatus(404);
    const cfg = { user: { _id: ids[i], displayName: names[i] }, token: jwt.sign({ userId: ids[i] }, process.env.ACCESS_TOKEN_SECRET) };
    res.send(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>${styles}</style></head><body><div id="root"></div><script>window.fixtureConfig=${JSON.stringify(cfg)}</script><script type="module" src="/fixture.js"></script></body></html>`);
});
for (const name of ['fixture.js', 'fixture.css']) app.get('/'+name, (_req, res) => res.sendFile(path.join(output, name), { dotfiles: 'allow' }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(output, `chrome-${Date.now()}`);
const chrome = spawn(process.env.DIRECT_CALL_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `http://127.0.0.1:${server.address().port}/`,
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, evaluate;
const cases = [];
try {
    let port;
    for (let i=0;i<100;i++) { try { port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break; } catch { await delay(100); } }
    assert.ok(port, 'headless Chrome did not start');
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
    let nextId=0;const pending=new Map();
    socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){pending.get(v.id)?.(v);pending.delete(v.id)}});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;
        const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method))},15000);
        pending.set(id,v=>{clearTimeout(timeout);v.error?reject(Error(v.error.message)):resolve(v.result)});socket.send(JSON.stringify({id,method,params}))});
    evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
        if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const wait=async(expression,label)=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100)}
        throw Error(label+'; state: '+JSON.stringify(await evaluate(`['alice','bob','carol'].map(n=>({name:n,errors:frames[n].fixtureErrors,share:frames[n].fixture?.store.getState().isScreenSharing,peers:Object.values(frames[n].fixture?.store.getState().peers||{}).map(p=>({share:p.isScreenSharing,video:p.stream?.getVideoTracks().length}))}))`)))};
    const act=(name,code)=>evaluate(`frames.${name}.fixture.store.getState().${code}`);
    const colour=(name,channel)=>`(()=>{const c=frames.${name}.fixture.colour();return c&&c[${channel}]>150&&c[${channel===0?1:0}]<90})()`;
    await wait(`['alice','bob','carol'].every(n=>frames[n]?.fixtureReady)`, 'fixtures did not connect');
    await evaluate(`frames.alice.fixture.join()`);await wait(`frames.alice.fixture.store.getState().attendance`, 'Alice join');
    await evaluate(`frames.bob.fixture.join()`);await wait(`frames.bob.fixture.store.getState().attendance`, 'Bob join');
    await wait(`['alice','bob'].every(n=>frames[n].fixturePeers.some(p=>p.connected))`, 'initial peer connection');
    await act('alice','toggleScreenShare()');
    await wait(colour('bob',1), 'existing viewer did not render shared-screen pixels');cases.push('existing viewer receives screen with camera off');
    await evaluate(`frames.carol.fixture.join()`);
    await wait(colour('carol',1), 'late viewer did not render shared-screen pixels');cases.push('late join receives current screen with camera off');
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await writeFile(path.join(output,'late-join.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await act('alice','toggleScreenShare()');
    await wait(`['bob','carol'].every(n=>!Object.values(frames[n].fixture.store.getState().peers).find(p=>p.user.userId==='${ids[0]}')?.isScreenSharing)`, 'share stop state');
    await act('alice','toggleCamera()');
    await wait(colour('bob',0), 'existing viewer did not render camera after screen stop');
    await wait(colour('carol',0), 'late viewer did not render camera after screen stop');cases.push('stop screen then turn camera on');
    await act('alice','toggleScreenShare()');
    await wait(colour('bob',1), 'camera was not replaced by screen');
    await act('carol','leaveGroupCall()');await evaluate(`frames.carol.fixture.join()`);
    await wait(colour('carol',1), 'rejoining viewer did not get screen while camera on');cases.push('late rejoin receives screen with camera on');
    await act('alice','toggleCamera()');await act('alice','toggleCamera()');
    await wait(colour('bob',1), 'camera toggle replaced active screen');
    await wait(colour('carol',1), 'camera toggle lost late viewer screen');cases.push('camera toggles retain active shared screen');
    await evaluate(`frames.alice.fixture.store.getState().screenStream.getVideoTracks()[0].dispatchEvent(new Event('ended'))`);
    await wait(colour('bob',0), 'native screen stop did not restore camera');
    await wait(colour('carol',0), 'native screen stop did not restore late viewer camera');cases.push('native screen stop restores camera for all viewers');
    await act('alice','toggleCamera()');
    for(let i=0;i<2;i++){await act('alice','toggleScreenShare()');await wait(colour('carol',1),'repeated screen start');await act('alice','toggleScreenShare()')}
    cases.push('repeated sharing with camera off');
    assert.equal(await evaluate(`frames.alice.fixturePeers.filter(p=>!p.destroyed).every(p=>p._pc.getSenders().filter(s=>s.track?.kind==='audio').length===1&&p._pc.getSenders().find(s=>s.track?.kind==='audio').track===frames.alice.fixture.store.getState().localStream.getAudioTracks()[0])`),true,'video switching changed the sent mic');
    await act('alice','toggleMic()');
    assert.equal(await evaluate(`frames.alice.fixturePeers.filter(p=>!p.destroyed).every(p=>!p._pc.getSenders().find(s=>s.track?.kind==='audio').track.enabled)`),true,'mute did not disable every outgoing mic sender');
    await act('alice','toggleMic()');cases.push('video switching preserves one microphone sender and mute');
    await evaluate(`frames.alice.displayRequests=0;frames.alice.navigator.mediaDevices.getDisplayMedia=()=>{frames.alice.displayRequests++;return new Promise(r=>frames.alice.releaseDisplay=r)};frames.alice.pendingDisplay=frames.alice.fixture.store.getState().toggleScreenShare();true`);
    await act('alice','toggleScreenShare()');
    assert.equal(await evaluate(`frames.alice.displayRequests`),1,'double click acquired a second screen');
    await act('alice','leaveGroupCall()');
    await evaluate(`frames.alice.lateDisplay=frames.alice.fixture.video('#20d040');frames.alice.releaseDisplay(frames.alice.lateDisplay);frames.alice.pendingDisplay`);
    assert.equal(await evaluate(`!frames.alice.fixture.store.getState().isScreenSharing&&frames.alice.lateDisplay.getTracks().every(t=>t.readyState==='ended')`),true,'late screen picker revived a left room');
    cases.push('leaving during pending screen capture stops late tracks');
    await evaluate(`frames.alice.fixture.join()`);await wait(`frames.alice.fixture.store.getState().attendance`,'Alice rejoin');
    await evaluate(`frames.alice.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>frames.alice.releaseCamera=r);frames.alice.pendingCamera=frames.alice.fixture.store.getState().toggleCamera();true`);
    await act('alice','leaveGroupCall()');
    await evaluate(`frames.alice.lateCamera=frames.alice.fixture.video('#e02020');frames.alice.releaseCamera(frames.alice.lateCamera);frames.alice.pendingCamera`);
    assert.equal(await evaluate(`!frames.alice.fixture.store.getState().isCameraOn&&frames.alice.lateCamera.getTracks().every(t=>t.readyState==='ended')`),true,'late camera permission revived a left room');
    cases.push('leaving during pending camera capture stops late tracks');
    assert.deepEqual(await evaluate(`['alice','bob','carol'].flatMap(n=>frames[n].fixtureErrors)`),[]);
    const result={status:'passed',cases,participants:3,scope:'Real local Socket.IO/JWT, simple-peer, RTCPeerConnection and rendered canvas-video pixels; mock database, synthetic mic/camera/display, host ICE only. No real screen picker, physical devices, NAT/TURN or deployment acceptance.'};
    await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch (error) {
    await writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.message,completedCases:cases},null,2));
    throw error;
} finally {
    if(evaluate)await evaluate(`Promise.all(['alice','bob','carol'].map(n=>frames[n].fixture?.cleanup()))`).catch(()=>{});
    socket?.close();chrome.kill();
    await new Promise(resolve=>io.close(resolve));
    [User.findById,Conversation.findById,Conversation.exists,Message.create,Message.findById,Message.deleteOne,Conversation.find]=originals;
    await delay(300);
    assert.ok(path.resolve(profile).startsWith(path.resolve(output)+path.sep)&&/^chrome-\d+$/.test(path.basename(profile)));
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
}
