import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationPcmBridge } from '../src/socket/translationPcm.js';
import { defaultTranslationPair, updateTranslationPair, createTranslationRequest } from '../../client/src/components/chat/translationStream.js';

test('UI always creates an English/Vietnamese pair, including Chinese UI locale', () => {
    assert.deepEqual(defaultTranslationPair('zh-CN'), { sourceLanguage: 'en', targetLanguage: 'vi' });
    const pair = defaultTranslationPair('vi');
    assert.deepEqual(updateTranslationPair(pair, 'targetLanguage', 'en'), { sourceLanguage: 'vi', targetLanguage: 'en' });
    assert.deepEqual(updateTranslationPair(pair, 'targetLanguage', 'zh'), pair);
    assert.throws(() => createTranslationRequest({ ...pair, sourceLanguage: 'zh' }));
    assert.equal(createTranslationRequest({ ...pair, isSelf: true }).translate, false);
});

test('bridge rejects removed languages before session/user/AI access', async () => {
    const listeners = new Map();
    const bridge = createTranslationPcmBridge({
        getSession: () => assert.fail('must reject before session lookup'),
        findSpeaker: () => assert.fail('must reject before database lookup'),
        createWebSocket: () => assert.fail('must reject before AI connection'),
    });
    const socket = { id: 'socket', connected: true, data: { userId: 'a'.repeat(24) },
        on: (event, handler) => listeners.set(event, handler) };
    bridge.register(socket);
    try {
        for (const [sourceLanguage, targetLanguage] of [['zh', 'vi'], ['en', 'zh'], ['auto', 'vi']]) {
            const response = await new Promise(resolve => listeners.get('translation:start')({
                kind: 'direct', sessionId: 'b'.repeat(24), speakerId: 'c'.repeat(24), sourceLanguage, targetLanguage,
            }, resolve));
            assert.equal(response.status, 400);
        }
        assert.equal(bridge.size, 0);
    } finally { bridge.dispose(); }
});
