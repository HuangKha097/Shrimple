import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Crown, Download, Link2, Loader2, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useChatStore } from '../../stores/useChatStore.js';
import { chatService } from '../../services/chatService.js';
import styles from '../../assets/css/GroupDetails.module.scss';

const errorMessage = error => error.response?.data?.message || 'Không thể thực hiện thao tác. Vui lòng thử lại.';

const GroupInviteDialog = ({ chat, isLeader, onClose }) => {
    const qr = useRef(null);
    const [token, setToken] = useState('');
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const inviteUrl = token ? `${window.location.origin}/groups/join/${token}` : '';
    const socket = useAuthStore(state => state.socket);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const data = await chatService.getGroupInvite(chat._id);
                if (alive) { setToken(data.token); setError(''); }
            } catch (err) {
                if (alive) setError(errorMessage(err));
            } finally {
                if (alive) setBusy(false);
            }
        };
        load();
        const onChanged = ({ conversationId }) => {
            if (conversationId === chat._id) { setToken(''); setBusy(true); load(); }
        };
        socket?.on('groupInviteChanged', onChanged);
        return () => { alive = false; socket?.off('groupInviteChanged', onChanged); };
    }, [chat._id, socket]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const copyLink = async () => {
        try { await navigator.clipboard.writeText(inviteUrl); toast.success('Đã sao chép liên kết mời'); }
        catch { toast.error('Không thể sao chép tự động. Bạn có thể sao chép liên kết bên dưới.'); }
    };
    const rotateLink = async () => {
        if (!window.confirm('Tạo liên kết mới? URL và QR cũ sẽ không còn sử dụng được.')) return;
        setBusy(true);
        try {
            const data = await chatService.rotateGroupInvite(chat._id);
            setToken(data.token);
            toast.success('Đã tạo liên kết mới và thu hồi liên kết cũ');
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setBusy(false); }
    };
    const downloadQr = () => {
        const svg = qr.current?.querySelector('svg');
        if (!svg) return;
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `shrimple-group-qr-${chat.group?.name || 'invite'}.svg`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className={styles.dialogBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className={styles.dialogContent}>
                <div className={styles.dialogHeader}>
                    <div className={styles.dialogTitleGroup}>
                        <div className={styles.dialogIconBox}>
                            <Link2 size={18} />
                        </div>
                        <div>
                            <h2 id="invite-title">Mời tham gia nhóm</h2>
                            <span className={styles.dialogSubtitle}>{chat.name || chat.group?.name || 'Nhóm trò chuyện'}</span>
                        </div>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.dialogBody}>
                    {busy ? (
                        <div className={styles.loading} role="status">
                            <Loader2 className={styles.spinner} size={22} />
                            <span>Đang tải liên kết mời…</span>
                        </div>
                    ) : error ? (
                        <p className={styles.errorText} role="alert">{error}</p>
                    ) : (
                        <>
                            <div ref={qr} className={styles.qrCard}>
                                <QRCodeSVG value={inviteUrl} size={196} level="M" marginSize={2} title="QR tham gia nhóm" />
                            </div>
                            <p className={styles.qrHint}>Quét mã QR hoặc chia sẻ liên kết bên dưới để mời bạn bè vào nhóm.</p>

                            <div className={styles.inviteLinkBox}>
                                <input
                                    readOnly
                                    value={inviteUrl}
                                    onFocus={event => event.target.select()}
                                    aria-label="Liên kết mời"
                                />
                                <button type="button" className={styles.copyInlineBtn} onClick={copyLink} title="Sao chép liên kết">
                                    <Copy size={15} />
                                    <span>Sao chép</span>
                                </button>
                            </div>

                            <div className={styles.dialogActions}>
                                <button type="button" className={styles.secondaryBtn} onClick={downloadQr}>
                                    <Download size={16} />
                                    <span>Tải mã QR</span>
                                </button>
                                {isLeader && (
                                    <button type="button" className={styles.secondaryBtn} onClick={rotateLink} disabled={busy}>
                                        <RefreshCw size={15} />
                                        <span>Đổi liên kết mới</span>
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const GroupDetails = ({ chat, isLeader, showInvite, onCloseInvite, onClose }) => {
    const currentUserId = useAuthStore(state => state.user?._id);
    const isAdmin = chat.participants?.some(member => member._id === currentUserId && member.role === 'admin');
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const { updateGroup, deleteGroup } = useChatStore();

    const startEditing = () => {
        setName(chat.name || chat.group?.name || '');
        setDescription(chat.group?.descriptionGroup || '');
        setEditing(true);
    };

    const save = async event => {
        event.preventDefault();
        if (!name.trim()) { toast.error('Vui lòng nhập tên nhóm'); return; }
        setBusy(true);
        try {
            await updateGroup(chat._id, { name: name.trim(), descriptionGroup: description.trim() });
            setEditing(false);
            toast.success('Đã cập nhật thông tin nhóm');
        } catch (error) { toast.error(errorMessage(error)); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!window.confirm(`Xóa nhóm "${chat.name || chat.group?.name}" và toàn bộ tin nhắn? Thao tác này không thể hoàn tác.`)) return;
        setBusy(true);
        try { await deleteGroup(chat._id); onClose(); }
        catch (error) { toast.error(errorMessage(error)); }
        finally { setBusy(false); }
    };

    const creatorIdStr = (chat.group?.createdBy?._id || chat.group?.createdBy)?.toString();
    const leader = chat.participants?.find(p => p.role === 'leader' || p._id?.toString() === creatorIdStr);

    return (
        <section className={styles.details} aria-label="Thông tin nhóm">
            <div className={styles.metaHeader}>
                <div className={styles.leaderLine}>
                    <Crown size={14} className={styles.crownIcon} />
                    <span>Trưởng nhóm: <strong>{leader?.displayName || leader?.username || 'Chưa xác định'}</strong></span>
                </div>
                <span className={styles.roleBadge}>
                    {isLeader ? 'Trưởng nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                </span>
            </div>

            {!editing ? (
                <>
                    <p className={styles.description}>
                        {chat.group?.descriptionGroup || 'Nhóm chưa có mô tả.'}
                    </p>
                    {isLeader && (
                        <div className={styles.actions}>
                            <button type="button" className={styles.editBtn} disabled={busy} onClick={startEditing}>
                                <Pencil size={14} />
                                <span>Chỉnh sửa</span>
                            </button>
                            <button type="button" className={styles.danger} disabled={busy} onClick={remove}>
                                <Trash2 size={14} />
                                <span>Xóa nhóm</span>
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <form className={styles.editForm} onSubmit={save}>
                    <label className={styles.field}>
                        <span>Tên nhóm</span>
                        <input
                            value={name}
                            onChange={event => setName(event.target.value)}
                            required
                            maxLength={100}
                            disabled={busy}
                            placeholder="Nhập tên nhóm..."
                        />
                    </label>
                    <label className={styles.field}>
                        <span>Mô tả nhóm</span>
                        <textarea
                            value={description}
                            onChange={event => setDescription(event.target.value)}
                            maxLength={1000}
                            rows={3}
                            disabled={busy}
                            placeholder="Thêm mô tả cho nhóm..."
                        />
                    </label>
                    <div className={styles.actions}>
                        <button type="submit" className={styles.saveBtn} disabled={busy}>
                            {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
                        </button>
                        <button type="button" className={styles.cancelBtn} disabled={busy} onClick={() => setEditing(false)}>
                            Hủy
                        </button>
                    </div>
                </form>
            )}

            {showInvite && <GroupInviteDialog chat={chat} isLeader={isLeader} onClose={onCloseInvite} />}
        </section>
    );
};

export default GroupDetails;
