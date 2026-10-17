/** Insert '@' at the cursor position for chat, post and comment toolbars. */
export const insertAtTrigger = (value = '', onChange, inputRef) => {
    const el = inputRef?.current;
    const currentVal = value || '';
    if (!el) {
        const prefix = currentVal && !currentVal.endsWith(' ') ? `${currentVal} @` : `${currentVal}@`;
        onChange(prefix);
        return;
    }

    const start = typeof el.selectionStart === 'number' ? el.selectionStart : currentVal.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : currentVal.length;
    const before = currentVal.slice(0, start);
    const after = currentVal.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertStr = needsSpace ? ' @' : '@';
    const nextVal = before + insertStr + after;
    const nextCursor = before.length + insertStr.length;

    onChange(nextVal);
    requestAnimationFrame(() => {
        el.focus();
        try {
            el.setSelectionRange(nextCursor, nextCursor);
        } catch {
            // Some inputs do not support selection ranges.
        }
    });
};
