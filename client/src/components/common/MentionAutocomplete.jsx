import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import classNames from 'classnames/bind';
import { Users } from 'lucide-react';
import styles from '../../assets/css/MentionAutocomplete.module.scss';
import { useAuthStore } from '../../stores/useAuthStore.js';

const cx = classNames.bind(styles);

const DEFAULT_AVATAR =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%231f2937'><circle cx='12' cy='8' r='4' fill='%239ca3af'/><path d='M4 20c0-4 4-6 8-6s8 2 8 6' fill='%239ca3af'/></svg>";

const MentionAutocomplete = ({
    value = '',
    onChange,
    inputRef,
    candidates = [],
    includeEveryone = true,
    everyoneDesc = 'Nhắc tất cả mọi người',
    placement = 'top',
}) => {
    const currentUser = useAuthStore((s) => s.user);
    const myId = currentUser?._id?.toString();

    const [cursorPos, setCursorPos] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissedAtPos, setDismissedAtPos] = useState(null);
    const listRef = useRef(null);

    // Sync cursor position from input events
    useEffect(() => {
        const el = inputRef?.current;
        if (!el) return;

        const syncCursor = () => {
            if (typeof el.selectionStart === 'number') {
                setCursorPos(el.selectionStart);
            } else {
                setCursorPos((el.value || '').length);
            }
        };

        syncCursor();
        el.addEventListener('keyup', syncCursor);
        el.addEventListener('click', syncCursor);
        el.addEventListener('input', syncCursor);

        return () => {
            el.removeEventListener('keyup', syncCursor);
            el.removeEventListener('click', syncCursor);
            el.removeEventListener('input', syncCursor);
        };
    }, [inputRef, value]);

    // Parse active @mention token before cursor
    const mentionContext = useMemo(() => {
        if (!value || typeof value !== 'string') return null;
        const el = inputRef?.current;
        const pos =
            typeof el?.selectionStart === 'number'
                ? el.selectionStart
                : cursorPos !== null
                ? cursorPos
                : value.length;

        const textBeforeCursor = value.slice(0, pos);
        const match = textBeforeCursor.match(/(?:^|\s)@([A-Za-z0-9_À-ỹ.]*)$/);
        if (!match) return null;

        const query = match[1] || '';
        const atIndex = textBeforeCursor.lastIndexOf('@');
        if (atIndex === -1) return null;

        if (dismissedAtPos === atIndex) return null;

        return {
            atIndex,
            cursor: pos,
            query: query.toLowerCase(),
        };
    }, [value, cursorPos, inputRef, dismissedAtPos]);

    // Reset dismissed state when value changes away from that @
    useEffect(() => {
        if (!mentionContext && dismissedAtPos !== null) {
            setDismissedAtPos(null);
        }
    }, [mentionContext, dismissedAtPos]);

    // Build filtered suggestion list
    const filteredItems = useMemo(() => {
        if (!mentionContext) return [];
        const { query } = mentionContext;
        const list = [];

        if (includeEveryone) {
            const matchEveryone =
                !query ||
                'everyone'.includes(query) ||
                'tatca'.includes(query) ||
                'tất cả'.includes(query) ||
                'moinguoi'.includes(query) ||
                'mọi người'.includes(query);

            if (matchEveryone) {
                list.push({
                    _id: 'everyone',
                    isEveryone: true,
                    username: 'everyone',
                    displayName: '@everyone',
                    subtitle: everyoneDesc,
                });
            }
        }

        const seen = new Set();
        (candidates || []).forEach((raw) => {
            const u = raw?.userId || raw;
            if (!u) return;
            const idStr = (u._id || u.id || u.username)?.toString();
            if (!idStr || seen.has(idStr)) return;
            if (myId && idStr === myId) return; // skip self
            seen.add(idStr);

            const username = (u.username || '').trim();
            const displayName = (u.displayName || u.name || username || 'Người dùng').trim();
            if (!username && !displayName) return;

            const q = query.trim();
            if (
                !q ||
                username.toLowerCase().includes(q) ||
                displayName.toLowerCase().includes(q)
            ) {
                list.push({
                    _id: idStr,
                    isEveryone: false,
                    username: username || displayName.replace(/\s+/g, '_').toLowerCase(),
                    displayName,
                    avatarUrl: u.avatarUrl || DEFAULT_AVATAR,
                });
            }
        });

        return list.slice(0, 8);
    }, [mentionContext, candidates, includeEveryone, everyoneDesc, myId]);

    useEffect(() => {
        setActiveIndex(0);
    }, [mentionContext?.query, filteredItems.length]);

    const handleSelect = useCallback(
        (item) => {
            if (!mentionContext || !item) return;
            const { atIndex, cursor } = mentionContext;
            const before = value.slice(0, atIndex);
            const after = value.slice(cursor);
            const mentionToken = `@${item.username} `;
            const nextValue = before + mentionToken + after.replace(/^\s+/, '');
            const nextCursor = before.length + mentionToken.length;

            onChange(nextValue);
            setDismissedAtPos(null);

            requestAnimationFrame(() => {
                const el = inputRef?.current;
                if (el) {
                    el.focus();
                    try {
                        el.setSelectionRange(nextCursor, nextCursor);
                    } catch {
                        // ignore
                    }
                    setCursorPos(nextCursor);
                }
            });
        },
        [mentionContext, value, onChange, inputRef]
    );

    // Intercept keyboard navigation in capture phase so Enter/Tab selects mention instead of submitting form
    useEffect(() => {
        const el = inputRef?.current;
        if (!el || filteredItems.length === 0 || !mentionContext) return;

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((prev) => (prev + 1) % filteredItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                const chosen = filteredItems[activeIndex] || filteredItems[0];
                if (chosen) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof e.stopImmediatePropagation === 'function') {
                        e.stopImmediatePropagation();
                    }
                    handleSelect(chosen);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setDismissedAtPos(mentionContext.atIndex);
            }
        };

        el.addEventListener('keydown', handleKeyDown, true);
        return () => {
            el.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [inputRef, filteredItems, activeIndex, mentionContext, handleSelect]);

    if (!mentionContext || filteredItems.length === 0) {
        return null;
    }

    return (
        <div
            ref={listRef}
            className={cx('mention-popup', `placement-${placement}`)}
            onMouseDown={(e) => {
                // Prevent input blur when clicking inside popup
                e.preventDefault();
            }}
        >
            <div className={cx('mention-header')}>
                <span>Nhắc đến (@mention)</span>
                <span className={cx('hint')}>↑↓ chọn · Enter để chèn</span>
            </div>

            {filteredItems.map((item, idx) => (
                <button
                    key={item._id}
                    type="button"
                    className={cx('mention-item', { active: idx === activeIndex })}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(item)}
                >
                    <div className={cx('avatar-wrap', { 'everyone-badge': item.isEveryone })}>
                        {item.isEveryone ? (
                            <Users size={16} />
                        ) : (
                            <img
                                src={item.avatarUrl || DEFAULT_AVATAR}
                                alt={item.displayName}
                                onError={(e) => {
                                    e.currentTarget.src = DEFAULT_AVATAR;
                                }}
                            />
                        )}
                    </div>

                    <div className={cx('info')}>
                        <div className={cx('name-row')}>
                            <span className={cx('display-name')}>{item.displayName}</span>
                            {item.isEveryone && <span className={cx('tag-pill')}>Tất cả</span>}
                        </div>
                        <span className={cx('username')}>
                            {item.isEveryone ? item.subtitle : `@${item.username}`}
                        </span>
                    </div>
                </button>
            ))}
        </div>
    );
};

export default MentionAutocomplete;
