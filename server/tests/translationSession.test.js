import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';

process.env.ACCESS_TOKEN_SECRET = 'translation-session-test-secret';
const { server, io, isTranslationParticipant } = await import('../src/socket/socket.js');

const connectUser = (url, token) => new Promise((resolve, reject) => {
    const client = connect(url, { auth: { token }, reconnection: false, transports: ['websocket'] });
    client.once('connect', () => resolve(client));
    client.once('connect_error', error => { client.close(); reject(error); });
});

test('only authenticated participants can translate an accepted direct call', async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const token = userId => jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    const clients = [];
    try {
        await assert.rejects(connectUser(url, 'bad-token'), /Authentication required/);
        const alice = await connectUser(url, token('alice'));
        const bob = await connectUser(url, token('bob'));
        clients.push(alice, bob);

        alice.emit('callUser', { userToCall: 'bob', signalData: {}, from: 'mallory' });
        const incoming = await new Promise(resolve => bob.once('callUser', resolve));
        assert.equal(incoming.from, 'alice');
        assert.equal(isTranslationParticipant('direct', 'bob', 'alice', 'bob'), false);

        bob.emit('answerCall', { to: 'alice', signal: {} });
        await new Promise(resolve => alice.once('callAccepted', resolve));
        assert.equal(isTranslationParticipant('direct', 'bob', 'alice', 'bob'), true);
        assert.equal(isTranslationParticipant('direct', 'bob', 'mallory', 'bob'), false);

        alice.emit('endCall', { to: 'bob' });
        await new Promise(resolve => bob.once('endCall', resolve));
        assert.equal(isTranslationParticipant('direct', 'bob', 'alice', 'bob'), false);
    } finally {
        clients.forEach(client => client.close());
        await new Promise(resolve => io.close(resolve));
    }
});
