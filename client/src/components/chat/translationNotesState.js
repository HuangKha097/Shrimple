const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const validRevision = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length <= 32768;

export function interruptTranslationNotes(notes, streamId) {
    return notes.map(note => (!streamId || note.streamId === streamId) && note.translationState === 'pending'
        ? { ...note, translationState: 'interrupted' } : note);
}

export function reduceTranslationNotes(notes, event, time) {
    if (!event || !validId(event.streamId) || !validId(event.utteranceId) || !validRevision(event.revision)) return notes;
    const id = `${event.streamId}:${event.utteranceId}`;
    const index = notes.findIndex(note => note.id === id);
    const current = notes[index];
    let updated;
    if (event.type === 'transcript') {
        const isSelf = event.translate === false;
        const expectedState = isSelf ? 'self' : 'pending';
        if (!text(event.original) || !event.original.trim() || typeof event.isFinal !== 'boolean' ||
            !validId(event.speakerId) || !['en', 'vi'].includes(event.sourceLanguage) ||
            !['en', 'vi'].includes(event.targetLanguage) ||
            (isSelf ? event.sourceLanguage !== event.targetLanguage : event.sourceLanguage === event.targetLanguage) ||
            (current && (current.isFinal || current.translationState !== expectedState || event.revision <= current.revision))) return notes;
        updated = { ...event, id, time: current?.time || time, translationState: expectedState };
    } else if (event.type === 'translation') {
        if (!current?.isFinal || current.translationState !== 'pending' || current.revision !== event.revision || !text(event.translated)) return notes;
        updated = { ...current, translated: event.translated, translationState: event.translated.trim() ? 'complete' : 'error' };
    } else if (event.type === 'error' && (current?.translationState === 'pending' || (current?.translationState === 'self' && !current?.isFinal)) && current.revision === event.revision) {
        updated = { ...current, translationState: 'error', message: typeof event.message === 'string' ? event.message.slice(0, 4096) : '' };
    } else return notes;
    if (index < 0) return [...notes.slice(-49), updated];
    return notes.map((note, position) => position === index ? updated : note);
}
