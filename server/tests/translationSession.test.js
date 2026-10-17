import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';

process.env.ACCESS_TOKEN_SECRET = 'translation-session-test-secret';
const { server, io, isTranslationParticipant } = await import('../src/socket/socket.js');

const connectUser = (url, token) => new Promise((resolve, reject) => {
    const client = connect(url, { auth: { token }, reconnection: false, transports: ['websocket'] });
    client.once('connect', () => resolve(client));
    client.once('connect_error', error => { client.close(); reject(error); });
});

test('only authenticated participants can translate an accepted direct call', async () => {
    const mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const [aliceUser, bobUser] = await User.create(['alice', 'bob'].map(name => ({
        displayName: name, username: name, email: `${name}@example.test`, password: 'test-only', isProfileComplete: true,
    })));
    const aliceId = aliceUser.id, bobId = bobUser.id;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const token = userId => jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    const clients = [];
    try {
        await assert.rejects(connectUser(url, 'bad-token'), /đăng nhập/);
        await assert.rejects(connectUser(url, token(new mongoose.Types.ObjectId().toString())), /không tồn tại/);
        const alice = await connectUser(url, token(aliceId));
        const bob = await connectUser(url, token(bobId));
        clients.push(alice, bob);

        alice.emit('callUser', { userToCall: bobId, signalData: {}, from: 'mallory' });
        const incoming = await new Promise(resolve => bob.once('callUser', resolve));
        assert.equal(incoming.from, aliceId);
        assert.equal(isTranslationParticipant('direct', bobId, aliceId, bobId), false);

        bob.emit('answerCall', { to: aliceId, signal: {} });
        await new Promise(resolve => alice.once('callAccepted', resolve));
        assert.equal(isTranslationParticipant('direct', bobId, aliceId, bobId), true);
        assert.equal(isTranslationParticipant('direct', bobId, 'mallory', bobId), false);
        await alice.emitWithAck('getAllActiveGroupCalls');
        assert.equal(isTranslationParticipant('direct', bobId, aliceId, bobId), true);

        alice.emit('endCall', { to: bobId });
        await new Promise(resolve => bob.once('endCall', resolve));
        assert.equal(isTranslationParticipant('direct', bobId, aliceId, bobId), false);
    } finally {
        clients.forEach(client => client.close());
        await new Promise(resolve => io.close(resolve));
        await mongoose.disconnect();
        await mongo.stop();
    }
}, { timeout: 300000 });
