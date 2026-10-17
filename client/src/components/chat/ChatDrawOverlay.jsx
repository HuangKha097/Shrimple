import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { create } from 'zustand';
import classNames from 'classnames/bind';
import {
    PenTool,
    Sparkles,
    Highlighter,
    Eraser,
    Undo2,
    Trash2,
    Eye,
    EyeOff,
    Send,
    Pin,
    X,
    Minus,
} from 'lucide-react';
import styles from '../../assets/css/ChatDrawOverlay.module.scss';
import { useChatStore } from '../../stores/useChatStore.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const PRESET_COLORS = [
    '#f97316', // Shrimple Orange
    '#ff2a85', // Instagram Neon Pink
    '#00f2fe', // Electric Cyan
    '#a855f7', // Neon Purple
    '#22c55e', // Vivid Lime
    '#facc15', // Sunshine Yellow
    '#ef4444', // Coral Red
    '#ffffff', // Pure White
];

const STROKE_SIZES = [
    { label: 'Nhỏ', value: 3, dot: 5 },
    { label: 'Vừa', value: 6, dot: 8 },
    { label: 'Lớn', value: 11, dot: 12 },
    { label: 'Cực đại', value: 18, dot: 15 },
];

/**
 * Shared store between Top-Pinned Toolbar (ChatDrawOverlay) and Scroll-Anchored Layer (ChatDrawScrollLayer)
 */
const useDrawToolStore = create((set) => ({
    brushMode: 'neon', // 'neon' | 'solid' | 'highlighter' | 'dashed' | 'eraser'
    color: '#f97316',
    strokeSize: 6,
    isHiddenLocal: false,
    setBrushMode: (brushMode) => set({ brushMode }),
    setColor: (color) => set({ color }),
    setStrokeSize: (strokeSize) => set({ strokeSize }),
    setIsHiddenLocal: (isHiddenLocal) => set({ isHiddenLocal }),
    toggleHiddenLocal: () => set((s) => ({ isHiddenLocal: !s.isHiddenLocal })),
}));

const resolveRecipientId = (currentConvo, currentUser) => {
    if (currentConvo?.participants && currentUser) {
        const currentUserIdStr = (currentUser._id || currentUser.id)?.toString();
        const partner = currentConvo.participants.find((p) => {
            if (!p) return false;
            const pId = (p._id || p.userId?._id || p.userId)?.toString();
            return pId && pId !== currentUserIdStr;
        });
        if (partner) {
            return (partner._id || partner.userId?._id || partner.userId)?.toString();
        }
    }
    return null;
};

/**
 * Resolve pixel coordinates of a stroke's points inside .messages-inner-container
 */
const resolveStrokePixelPoints = (stroke, width, height, innerEl) => {
    const pts = stroke?.points;
    if (!pts || pts.length === 0) return [];

    let anchorTop = null;
    if (stroke.anchorMsgId && innerEl) {
        const msgEl = document.getElementById(stroke.anchorMsgId);
        if (msgEl && innerEl.contains(msgEl)) {
            anchorTop = msgEl.offsetTop;
        }
    }

    return pts.map((pt) => {
        const x = (typeof pt.x === 'number' ? pt.x : 0) * width;
        let y;
        if (anchorTop !== null && typeof pt.dy === 'number') {
            y = anchorTop + pt.dy;
        } else if (typeof pt.bottomOffset === 'number') {
            y = height - pt.bottomOffset;
        } else if (typeof pt.absY === 'number') {
            y = pt.absY;
        } else {
            y = (typeof pt.y === 'number' ? pt.y : 0) * height;
        }
        return { x, y };
    });
};

const buildSmoothSvgPath = (pixelPoints) => {
    if (!pixelPoints || pixelPoints.length === 0) return '';
    if (pixelPoints.length === 1) {
        const p = pixelPoints[0];
        return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.5).toFixed(1)} ${(p.y + 0.5).toFixed(1)}`;
    }
    let d = `M ${pixelPoints[0].x.toFixed(1)} ${pixelPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < pixelPoints.length; i++) {
        const prev = pixelPoints[i - 1];
        const curr = pixelPoints[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    const last = pixelPoints[pixelPoints.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
};

/**
 * 1. SCROLL-ANCHORED DRAWING LAYER
 * Mounted directly inside `.messages-inner-container` of `ChatBody.jsx`.
 * Drawings stay attached to the exact message/scroll position where they were drawn
 * and scroll naturally with the conversation content!
 */
export const ChatDrawScrollLayer = ({ conversationId, innerRef }) => {
    const { chatDrawings, setChatDrawing, isDrawModeOpen } = useChatStore();
    const { user: currentUser, socket } = useAuthStore();
    const { brushMode, color, strokeSize, isHiddenLocal, setIsHiddenLocal } = useDrawToolStore();

    const layerRef = useRef(null);
    const isDrawingRef = useRef(false);
    const [activeStroke, setActiveStroke] = useState(null);
    const [containerDim, setContainerDim] = useState({ width: 800, height: 600 });
    const [, setLayoutVersion] = useState(0);

    const currentDrawing = chatDrawings?.[conversationId];
    const strokes = useMemo(() => currentDrawing?.strokes || [], [currentDrawing]);

    // Observe size/layout changes of .messages-inner-container (e.g. infinite scroll loading older messages)
    useEffect(() => {
        const el = innerRef?.current || layerRef.current?.parentElement;
        if (!el) return;

        const updateMetrics = () => {
            setContainerDim({
                width: el.clientWidth || 800,
                height: el.scrollHeight || el.offsetHeight || 600,
            });
            setLayoutVersion((v) => v + 1);
        };

        updateMetrics();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(updateMetrics);
            ro.observe(el);
            return () => ro.disconnect();
        }
    }, [innerRef, strokes.length, conversationId]);

    const broadcastStrokes = useCallback(
        (nextStrokes) => {
            if (!conversationId) return;
            const authorName = currentUser?.displayName || currentUser?.username || 'Bạn';
            const payload = {
                conversationId,
                strokes: nextStrokes,
                updatedBy: { _id: currentUser?._id, name: authorName },
                updatedAt: new Date().toISOString(),
            };
            setChatDrawing(conversationId, payload);
            if (socket) {
                socket.emit('updateChatScreenDrawing', {
                    conversationId,
                    strokes: nextStrokes,
                    authorName,
                });
            }
        },
        [conversationId, currentUser, setChatDrawing, socket]
    );

    // Find closest message DOM element (#msg-...) inside .messages-inner-container at localY
    const findAnchorMessageAtY = (localY, innerEl) => {
        if (!innerEl) return { anchorMsgId: null, anchorTop: null };
        const msgNodes = innerEl.querySelectorAll('[id^="msg-"]');
        let bestId = null;
        let bestTop = null;
        let bestDist = Infinity;

        msgNodes.forEach((node) => {
            const top = node.offsetTop;
            const center = top + node.offsetHeight / 2;
            const dist = Math.abs(localY - center);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = node.id;
                bestTop = top;
            }
        });

        return { anchorMsgId: bestId, anchorTop: bestTop };
    };

    const getLocalCoords = (e) => {
        const layerEl = layerRef.current;
        if (!layerEl) return { localX: 0, localY: 0, width: 1, height: 1 };
        const rect = layerEl.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            localX: clientX - rect.left,
            localY: clientY - rect.top,
            width: rect.width || 1,
            height: rect.height || 1,
        };
    };

    // Erase stroke points within eraserRadius of (localX, localY)
    const eraseAtPoint = (localX, localY, width, height, innerEl) => {
        const eraserRadius = Math.max(18, strokeSize * 2.4);
        let changed = false;
        const nextStrokes = [];

        strokes.forEach((stroke) => {
            const resolved = resolveStrokePixelPoints(stroke, width, height, innerEl);
            let currentSegment = [];

            resolved.forEach((pxPt, idx) => {
                const dist = Math.hypot(pxPt.x - localX, pxPt.y - localY);
                if (dist <= eraserRadius) {
                    changed = true;
                    if (currentSegment.length > 0) {
                        nextStrokes.push({
                            ...stroke,
                            id: `${stroke.id}-seg-${idx}-${Math.random().toString(36).slice(2, 5)}`,
                            points: currentSegment,
                        });
                        currentSegment = [];
                    }
                } else {
                    currentSegment.push(stroke.points[idx]);
                }
            });

            if (currentSegment.length === stroke.points.length) {
                nextStrokes.push(stroke);
            } else if (currentSegment.length > 0) {
                nextStrokes.push({
                    ...stroke,
                    id: `${stroke.id}-tail-${Math.random().toString(36).slice(2, 5)}`,
                    points: currentSegment,
                });
            }
        });

        if (changed) {
            broadcastStrokes(nextStrokes);
        }
    };

    const handlePointerDown = (e) => {
        if (!isDrawModeOpen) return;
        if (e.button !== undefined && e.button !== 0) return;

        isDrawingRef.current = true;
        setIsHiddenLocal(false);

        const innerEl = innerRef?.current || layerRef.current?.parentElement;
        const { localX, localY, width, height } = getLocalCoords(e);

        if (brushMode === 'eraser') {
            eraseAtPoint(localX, localY, width, height, innerEl);
            return;
        }

        const { anchorMsgId, anchorTop } = findAnchorMessageAtY(localY, innerEl);
        const pt = {
            x: Math.max(0, Math.min(1, localX / width)),
            dy: anchorTop !== null ? localY - anchorTop : undefined,
            bottomOffset: height - localY,
            absY: localY,
        };

        setActiveStroke({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            mode: brushMode,
            color,
            size: strokeSize,
            anchorMsgId,
            _anchorTop: anchorTop,
            points: [pt],
        });
    };

    const handlePointerMove = (e) => {
        if (!isDrawingRef.current || !isDrawModeOpen) return;

        const innerEl = innerRef?.current || layerRef.current?.parentElement;
        const { localX, localY, width, height } = getLocalCoords(e);

        if (brushMode === 'eraser') {
            eraseAtPoint(localX, localY, width, height, innerEl);
            return;
        }

        setActiveStroke((prev) => {
            if (!prev) return null;
            const anchorTop = prev._anchorTop;
            const nextPt = {
                x: Math.max(0, Math.min(1, localX / width)),
                dy: anchorTop !== null && anchorTop !== undefined ? localY - anchorTop : undefined,
                bottomOffset: height - localY,
                absY: localY,
            };
            const lastPt = prev.points[prev.points.length - 1];
            if (lastPt && Math.hypot((nextPt.x - lastPt.x) * width, nextPt.absY - (lastPt.absY ?? 0)) < 2.5) {
                return prev;
            }
            return {
                ...prev,
                points: [...prev.points, nextPt],
            };
        });
    };

    const handlePointerUp = () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;

        if (activeStroke && activeStroke.points.length > 0) {
            const cleanStroke = {
                id: activeStroke.id,
                mode: activeStroke.mode,
                color: activeStroke.color,
                size: activeStroke.size,
                anchorMsgId: activeStroke.anchorMsgId,
                points: activeStroke.points.map(({ x, dy, bottomOffset, absY }) => ({
                    x,
                    dy,
                    bottomOffset,
                    absY,
                })),
            };
            setActiveStroke(null);
            broadcastStrokes([...strokes, cleanStroke]);
        }
    };

    const innerEl = innerRef?.current || layerRef.current?.parentElement;
    const allStrokesToRender = activeStroke ? [...strokes, activeStroke] : strokes;

    return (
        <div
            ref={layerRef}
            className={cx('scroll-draw-layer', {
                interactive: isDrawModeOpen,
                'hidden-layer': isHiddenLocal && !isDrawModeOpen,
            })}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
        >
            <svg
                className={cx('scroll-draw-svg')}
                width="100%"
                height="100%"
            >
                {allStrokesToRender.map((stroke) => {
                    if (stroke.mode === 'eraser') return null;
                    const pxPoints = resolveStrokePixelPoints(
                        stroke,
                        containerDim.width,
                        containerDim.height,
                        innerEl
                    );
                    const d = buildSmoothSvgPath(pxPoints);
                    if (!d) return null;

                    const baseSize = Number(stroke.size) || 6;
                    const strokeColor = stroke.color || '#f97316';
                    const mode = stroke.mode || 'solid';

                    if (mode === 'neon') {
                        return (
                            <g key={stroke.id}>
                                <path
                                    d={d}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth={baseSize}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{
                                        filter: `drop-shadow(0 0 ${baseSize * 1.2}px ${strokeColor}) drop-shadow(0 0 ${baseSize * 2.4}px ${strokeColor})`,
                                    }}
                                />
                                <path
                                    d={d}
                                    fill="none"
                                    stroke="#ffffff"
                                    strokeOpacity={0.82}
                                    strokeWidth={Math.max(1.5, baseSize * 0.36)}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </g>
                        );
                    }

                    if (mode === 'highlighter') {
                        return (
                            <path
                                key={stroke.id}
                                d={d}
                                fill="none"
                                stroke={strokeColor}
                                strokeOpacity={0.38}
                                strokeWidth={baseSize * 2.2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        );
                    }

                    if (mode === 'dashed') {
                        return (
                            <path
                                key={stroke.id}
                                d={d}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={baseSize}
                                strokeDasharray={`${baseSize * 1.8} ${baseSize * 1.4}`}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        );
                    }

                    return (
                        <path
                            key={stroke.id}
                            d={d}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={baseSize}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    );
                })}
            </svg>
        </div>
    );
};

/**
 * 2. TOP-PINNED TOOLBAR & CONTROLS
 * Mounted at the top of the chat viewport (`ChatContainer.jsx`) so the Pen tool is always reachable.
 */
const ChatDrawOverlay = ({ conversationId }) => {
    const {
        chatDrawings,
        setChatDrawing,
        isDrawModeOpen,
        setIsDrawModeOpen,
        conversations,
        sendDirectMessage,
        sendGroupMessage,
    } = useChatStore();
    const { user: currentUser, socket } = useAuthStore();
    const {
        brushMode,
        color,
        strokeSize,
        isHiddenLocal,
        setBrushMode,
        setColor,
        setStrokeSize,
        setIsHiddenLocal,
        toggleHiddenLocal,
    } = useDrawToolStore();

    const [isSendingImage, setIsSendingImage] = useState(false);

    const currentDrawing = chatDrawings?.[conversationId];
    const strokes = useMemo(() => currentDrawing?.strokes || [], [currentDrawing]);
    const updatedByName = currentDrawing?.updatedBy?.name;

    // Fetch existing drawing for this conversation on open
    useEffect(() => {
        if (!conversationId || !socket) return;
        socket.emit('getChatScreenDrawing', { conversationId }, (res) => {
            if (res && Array.isArray(res.strokes) && res.strokes.length > 0) {
                setChatDrawing(conversationId, res);
            }
        });
    }, [conversationId, socket, setChatDrawing]);

    const handleUndo = () => {
        if (strokes.length === 0) return;
        const nextStrokes = strokes.slice(0, -1);
        const authorName = currentUser?.displayName || currentUser?.username || 'Bạn';
        const payload = {
            conversationId,
            strokes: nextStrokes,
            updatedBy: { _id: currentUser?._id, name: authorName },
            updatedAt: new Date().toISOString(),
        };
        setChatDrawing(conversationId, payload);
        if (socket) {
            socket.emit('updateChatScreenDrawing', {
                conversationId,
                strokes: nextStrokes,
                authorName,
            });
        }
    };

    const handleClearAll = () => {
        if (strokes.length === 0) return;
        const authorName = currentUser?.displayName || currentUser?.username || 'Bạn';
        setChatDrawing(conversationId, {
            conversationId,
            strokes: [],
            updatedBy: null,
        });
        if (socket) {
            socket.emit('clearChatScreenDrawing', { conversationId, authorName });
        }
        toast.info('Đã xóa nét vẽ trong cuộc trò chuyện');
    };

    const handlePinAndClose = () => {
        setIsDrawModeOpen(false);
        if (strokes.length > 0) {
            toast.success('Đã đính nét vẽ tại vị trí tin nhắn!');
        }
    };

    const handleSendAsChatImage = async () => {
        if (strokes.length === 0 || isSendingImage) return;
        setIsSendingImage(true);
        const toastId = toast.loading('Đang gửi bản vẽ vào cuộc trò chuyện...');

        try {
            const innerEl = document.querySelector('[data-chat-inner="true"]');
            const width = innerEl?.clientWidth || 720;
            const height = innerEl?.scrollHeight || 600;

            // Compute bounding box of all strokes so exported image frames the drawing nicely
            let minY = Infinity;
            let maxY = -Infinity;
            const resolvedStrokes = strokes.map((s) => {
                const pts = resolveStrokePixelPoints(s, width, height, innerEl);
                pts.forEach((p) => {
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });
                return { stroke: s, pts };
            });

            const pad = 48;
            const topY = Math.max(0, (Number.isFinite(minY) ? minY : 0) - pad);
            const exportHeight = Math.max(240, Math.min(1200, (Number.isFinite(maxY) ? maxY - topY : 400) + pad * 2));

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = width;
            exportCanvas.height = exportHeight;
            const ctx = exportCanvas.getContext('2d');
            ctx.fillStyle = '#0b0e14';
            ctx.fillRect(0, 0, width, exportHeight);

            resolvedStrokes.forEach(({ stroke, pts }) => {
                if (!pts.length || stroke.mode === 'eraser') return;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const baseSize = Number(stroke.size) || 6;
                const strokeColor = stroke.color || '#f97316';
                if (stroke.mode === 'neon') {
                    ctx.shadowColor = strokeColor;
                    ctx.shadowBlur = baseSize * 2.5;
                } else if (stroke.mode === 'highlighter') {
                    ctx.globalAlpha = 0.38;
                } else if (stroke.mode === 'dashed') {
                    ctx.setLineDash([baseSize * 1.8, baseSize * 1.4]);
                }
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = stroke.mode === 'highlighter' ? baseSize * 2.2 : baseSize;

                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y - topY);
                for (let i = 1; i < pts.length; i++) {
                    const prev = pts[i - 1];
                    const curr = pts[i];
                    ctx.quadraticCurveTo(
                        prev.x,
                        prev.y - topY,
                        (prev.x + curr.x) / 2,
                        (prev.y + curr.y) / 2 - topY
                    );
                }
                ctx.stroke();
                ctx.restore();
            });

            const dataUrl = exportCanvas.toDataURL('image/png');
            const currentConvo = (conversations || []).find((c) => c && c._id === conversationId);
            if (currentConvo?.isGroup) {
                await sendGroupMessage(conversationId, '🎨 Đã gửi một nét vẽ tay', dataUrl, null, 'text');
            } else {
                const recipientId = resolveRecipientId(currentConvo, currentUser);
                if (recipientId) {
                    await sendDirectMessage(recipientId, '🎨 Đã gửi một nét vẽ tay', conversationId, dataUrl, null, 'text');
                }
            }
            toast.success('Đã gửi bản vẽ vào đoạn chat!', { id: toastId });
        } catch (err) {
            console.error('Failed to send drawing as image:', err);
            toast.error('Không thể gửi bản vẽ', { id: toastId });
        } finally {
            setIsSendingImage(false);
        }
    };

    const hasStrokes = strokes.length > 0;

    return (
        <>
            {!isDrawModeOpen ? (
                <div className={cx('pinned-top-bar', { 'has-drawing': hasStrokes })}>
                    {hasStrokes && (
                        <div className={cx('pinned-status-info')}>
                            <span className={cx('pulse-dot')} />
                            <span>Nét vẽ trong đoạn chat</span>
                            {updatedByName && (
                                <span className={cx('author-sub')}>({updatedByName})</span>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        className={cx('pinned-pen-trigger')}
                        onClick={() => {
                            setIsHiddenLocal(false);
                            setIsDrawModeOpen(true);
                        }}
                        title="Vẽ trực tiếp lên vị trí tin nhắn (Instagram Draw)"
                    >
                        <PenTool size={14} />
                        <span>{hasStrokes ? 'Vẽ thêm' : 'Bút vẽ màn hình'}</span>
                    </button>

                    {hasStrokes && (
                        <>
                            <button
                                type="button"
                                className={cx('pinned-mini-btn')}
                                onClick={toggleHiddenLocal}
                                title={isHiddenLocal ? 'Hiện nét vẽ' : 'Tạm ẩn nét vẽ'}
                            >
                                {isHiddenLocal ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <button
                                type="button"
                                className={cx('pinned-mini-btn', 'danger')}
                                onClick={handleClearAll}
                                title="Xóa toàn bộ nét vẽ"
                            >
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className={cx('draw-studio-dock')}>
                    <div className={cx('studio-top-row')}>
                        <div className={cx('studio-brand')}>
                            <span className={cx('brand-badge')}>
                                <PenTool size={14} />
                            </span>
                            <span>Vẽ lên đoạn Chat</span>
                            <span className={cx('live-pill')}>Cuộn theo vị trí vẽ</span>
                        </div>

                        <div className={cx('brush-group')}>
                            <button
                                type="button"
                                className={cx('brush-btn', { active: brushMode === 'neon' })}
                                onClick={() => setBrushMode('neon')}
                                title="Bút Neon phát sáng (Instagram Glow)"
                            >
                                <Sparkles size={14} />
                                <span>Neon</span>
                            </button>
                            <button
                                type="button"
                                className={cx('brush-btn', { active: brushMode === 'solid' })}
                                onClick={() => setBrushMode('solid')}
                                title="Bút nét liền"
                            >
                                <PenTool size={14} />
                                <span>Nét liền</span>
                            </button>
                            <button
                                type="button"
                                className={cx('brush-btn', { active: brushMode === 'highlighter' })}
                                onClick={() => setBrushMode('highlighter')}
                                title="Bút dạ quang"
                            >
                                <Highlighter size={14} />
                                <span>Dạ quang</span>
                            </button>
                            <button
                                type="button"
                                className={cx('brush-btn', { active: brushMode === 'dashed' })}
                                onClick={() => setBrushMode('dashed')}
                                title="Bút nét đứt"
                            >
                                <Minus size={14} />
                                <span>Nét đứt</span>
                            </button>
                            <button
                                type="button"
                                className={cx('brush-btn', { active: brushMode === 'eraser' })}
                                onClick={() => setBrushMode('eraser')}
                                title="Tẩy nét vẽ tại vị trí chạm"
                            >
                                <Eraser size={14} />
                                <span>Tẩy</span>
                            </button>
                        </div>

                        <div className={cx('studio-actions')}>
                            <button
                                type="button"
                                className={cx('action-icon-btn')}
                                onClick={handleUndo}
                                disabled={!hasStrokes}
                                title="Hoàn tác nét vừa vẽ"
                            >
                                <Undo2 size={15} />
                            </button>
                            <button
                                type="button"
                                className={cx('action-icon-btn', 'danger')}
                                onClick={handleClearAll}
                                disabled={!hasStrokes}
                                title="Xóa toàn bộ nét vẽ"
                            >
                                <Trash2 size={15} />
                            </button>
                            <button
                                type="button"
                                className={cx('action-pill-btn')}
                                onClick={handleSendAsChatImage}
                                disabled={!hasStrokes || isSendingImage}
                                title="Gửi bản vẽ thành hình ảnh trong tin nhắn"
                            >
                                <Send size={13} />
                                <span>Gửi ảnh</span>
                            </button>
                            <button
                                type="button"
                                className={cx('action-pill-btn', 'primary')}
                                onClick={handlePinAndClose}
                                title="Xong & giữ nét vẽ tại vị trí tin nhắn"
                            >
                                <Pin size={13} />
                                <span>Xong</span>
                            </button>
                            <button
                                type="button"
                                className={cx('action-icon-btn')}
                                onClick={() => setIsDrawModeOpen(false)}
                                title="Đóng bảng vẽ"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className={cx('studio-bottom-row')}>
                        <div className={cx('palette-row')}>
                            {PRESET_COLORS.map((hex) => (
                                <button
                                    key={hex}
                                    type="button"
                                    className={cx('color-swatch', {
                                        active: color.toLowerCase() === hex.toLowerCase() && brushMode !== 'eraser',
                                    })}
                                    style={{ backgroundColor: hex }}
                                    onClick={() => {
                                        setColor(hex);
                                        if (brushMode === 'eraser') setBrushMode('neon');
                                    }}
                                    title={`Màu ${hex}`}
                                />
                            ))}
                            <label className={cx('custom-color-label')} title="Tùy chọn màu khác">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => {
                                        setColor(e.target.value);
                                        if (brushMode === 'eraser') setBrushMode('neon');
                                    }}
                                />
                            </label>
                        </div>

                        <div className={cx('size-row')}>
                            <span className={cx('size-label')}>Cỡ nét:</span>
                            {STROKE_SIZES.map((s) => (
                                <button
                                    key={s.value}
                                    type="button"
                                    className={cx('size-btn', { active: strokeSize === s.value })}
                                    onClick={() => setStrokeSize(s.value)}
                                    title={s.label}
                                >
                                    <span
                                        className={cx('size-dot')}
                                        style={{ width: `${s.dot}px`, height: `${s.dot}px` }}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatDrawOverlay;
