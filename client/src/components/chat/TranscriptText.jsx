import { memo, useLayoutEffect, useState } from 'react';

// Presentation state only: always reconcile against the latest complete snapshot.
// No queued transcript strings, recognition decisions, or event/revision handling.
function createReveal(publish) {
    let words = [];
    let shown = 0;
    let nextId = 0;
    let timer = null;
    let immediate = false;
    let deadline = 0;
    const render = () => publish(words.slice(0, shown));
    const cancel = () => { clearTimeout(timer); timer = null; };
    const schedule = () => {
        if (timer !== null || shown >= words.length || immediate) return;
        const remaining = words.length - shown;
        const budget = Math.max(0, deadline - performance.now());
        const previous = words[shown - 1]?.text.trim() || '';
        const natural = 65 + Math.min(previous.length * 3, 30) + (/[,.!?;:…]$/u.test(previous) ? 55 : 0);
        timer = setTimeout(() => {
            timer = null;
            // Large bursts use small batches to stay within the same catch-up budget.
            const slots = Math.max(1, Math.ceil((deadline - performance.now()) / 24));
            shown = Math.min(words.length, shown + Math.max(1, Math.ceil((words.length - shown) / slots)));
            render();
            schedule();
        }, Math.min(natural, Math.max(24, budget / remaining)));
    };
    return {
        update(text) {
            const parts = text.match(/\s*\S+\s*/gu) || (text ? [text] : []);
            const pending = shown < words.length;
            const positions = new Map();
            words.forEach((word, index) => {
                const key = word.text.trim();
                if (!positions.has(key)) positions.set(key, { indices: [], cursor: 0 });
                positions.get(key).indices.push(index);
            });
            let oldCursor = 0;
            const matches = parts.map(part => {
                const entry = positions.get(part.trim());
                if (!entry) return -1;
                while (entry.cursor < entry.indices.length && entry.indices[entry.cursor] < oldCursor) entry.cursor++;
                if (entry.cursor === entry.indices.length) return -1;
                const index = entry.indices[entry.cursor++];
                oldCursor = index + 1;
                return index;
            });
            // Map the visible boundary through edits. Insertions/deletions inside the
            // visible phrase are corrected in place; its unchanged words never replay.
            let oldAfter = 0;
            let newAfter = 0;
            let boundary = parts.length;
            for (let index = 0; index < matches.length; index++) {
                if (matches[index] < 0) continue;
                if (matches[index] >= shown) { boundary = index; break; }
                oldAfter = matches[index] + 1;
                newAfter = index + 1;
            }
            const nextShown = newAfter + Math.min(shown - oldAfter, boundary - newAfter);
            const previous = words;
            words = parts.map((part, index) => {
                const oldIndex = matches[index];
                // Corrections replace only the affected visible words; stable words keep DOM identity.
                return { id: oldIndex >= 0 ? previous[oldIndex].id : nextId++, text: part, animate: !immediate && index >= nextShown };
            });
            shown = immediate ? words.length : Math.max(nextShown, Math.min(1, words.length));
            if (!pending) deadline = performance.now() + 800;
            render();
            if (shown === words.length) cancel();
            schedule();
        },
        setImmediate(value) {
            immediate = value;
            if (value) {
                cancel();
                words = words.map(word => ({ ...word, animate: false }));
                shown = words.length;
                render();
            }
            else schedule();
        },
        cancel,
    };
}

function TranscriptText({ text, isFinal, stopped = false, skipInitialAnimation = false, onReveal }) {
    const [rendered, setRendered] = useState([]);
    const [reveal] = useState(() => createReveal(setRendered));

    useLayoutEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => reveal.setImmediate(stopped || motion.matches || document.visibilityState === 'hidden');
        // Historical notes should not replay when the panel is reopened.
        reveal.setImmediate(skipInitialAnimation || stopped || motion.matches || document.visibilityState === 'hidden');
        motion.addEventListener('change', sync);
        document.addEventListener('visibilitychange', sync);
        return () => {
            reveal.cancel();
            motion.removeEventListener('change', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, [reveal, stopped, skipInitialAnimation]);

    useLayoutEffect(() => { reveal.update(text); }, [reveal, text]);
    useLayoutEffect(() => { onReveal?.(); }, [rendered, onReveal]);

    const revealing = rendered.map(word => word.text).join('') !== text;
    return (
        <>
            {/* The log announces source updates, never each animation tick. */}
            <span className="translation-transcript-accessible">{text}</span>
            <span aria-hidden="true" className="translation-transcript-visual">
                {rendered.map(word => <span key={word.id} className={word.animate ? 'translation-transcript-word' : undefined}>{word.text}</span>)}
                {(revealing || (!isFinal && !stopped)) && <span className="translation-transcript-cursor" />}
            </span>
        </>
    );
}

export default memo(TranscriptText);
