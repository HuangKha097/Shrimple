import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { chatService } from '../services/chatService.js';
import { useChatStore } from '../stores/useChatStore.js';
import styles from '../assets/css/GroupDetails.module.scss';

const JoinGroupPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const [preview, setPreview] = useState({ token: null, group: null, error: '' });
    const [busy, setBusy] = useState(false);
    const loading = preview.token !== token;

    useEffect(() => {
        let alive = true;
        chatService.previewGroupInvite(token)
            .then(({ group }) => { if (alive) setPreview({ token, group, error: '' }); })
            .catch(error => { if (alive) setPreview({ token, group: null, error: error.response?.data?.message || 'Không thể tải lời mời. Vui lòng thử lại.' }); });
        return () => { alive = false; };
    }, [token]);

    const join = async () => {
        setBusy(true);
        try {
            const conversation = await useChatStore.getState().joinGroupInvite(token);
            sessionStorage.removeItem('shrimple-group-invite');
            navigate(`/chat?id=${conversation._id}`, { replace: true });
        } catch (error) { toast.error(error.response?.data?.message || 'Không thể tham gia nhóm'); }
        finally { setBusy(false); }
    };

    return <main className={styles.joinPage}><section className={styles.joinCard}>
        <Users size={44} className={styles.joinIcon} />
        {loading ? <div className={styles.loading} role="status"><Loader2 className={styles.spinner} /> Đang tải lời mời…</div> : preview.error ?
            <><h1>Không thể mở lời mời</h1><p role="alert">{preview.error}</p></> : <>
                <p>Bạn được mời tham gia nhóm</p>
                <h1>{preview.group.name}</h1>
                <p>{preview.group.memberCount} thành viên</p>
                {preview.group.descriptionGroup && <p className={styles.description}>{preview.group.descriptionGroup}</p>}
            </>}
        <div className={styles.actions}>
            {!loading && preview.group && <button type="button" disabled={busy} onClick={join}>
                {busy ? 'Đang tham gia…' : preview.group.isMember ? 'Mở nhóm' : 'Tham gia nhóm'}
            </button>}
            <button type="button" disabled={busy} onClick={() => { sessionStorage.removeItem('shrimple-group-invite'); navigate('/chat'); }}>Về trò chuyện</button>
        </div>
    </section></main>;
};

export default JoinGroupPage;
