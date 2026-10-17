import { useEffect, useState } from 'react';
import {useAuthStore} from "../stores/useAuthStore.js";
import {Navigate, Outlet} from "react-router";

import LoadingSpin from "../components/common/loading/LoadingSpin.jsx";

const ProtectedRoute = () => {
    const {accessToken, user} = useAuthStore()
    const [starting, setStarting] = useState(true);

    useEffect(() => {
        let alive = true;
        if (/^\/groups\/join\/(?:[a-f0-9]{64}|[a-f0-9]{24})$/.test(window.location.pathname)) {
            sessionStorage.setItem('shrimple-group-invite', window.location.pathname);
        } else if (window.location.pathname === '/chat') {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('invite');
            if (params.has('joinGroup') && /^(?:[a-f0-9]{64}|[a-f0-9]{24})$/.test(token || '')) {
                sessionStorage.setItem('shrimple-group-invite', `/groups/join/${token}`);
            }
        }
        const init = async () => {
            if (!useAuthStore.getState().accessToken) await useAuthStore.getState().refresh();
            const current = useAuthStore.getState();
            if (current.accessToken && !current.user) await current.fetchMe();
            else if (current.user) current.connectSocket();
            if (alive) setStarting(false);
        };
        init();
        return () => { alive = false; };
    }, [])
    if (starting) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: 'var(--primary-backgroundColor, #000000)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: "center",
                alignItems: "center",
                gap: '24px'
            }}>
                <img
                    src="/logo_remove_bg.png"
                    alt="Logo"
                    style={{
                        width: '64px',
                        height: '64px',
                        objectFit: 'contain'
                    }}
                />
                <LoadingSpin size={26} strokeWidth={2.5} />
            </div>
        );
    }
    if (!accessToken) {
        return <Navigate to="/signin" replace={true}/>
    }
    
    if (user && !user.isProfileComplete && window.location.pathname !== "/complete-profile") {
        return <Navigate to="/complete-profile" replace={true}/>
    }

    return (
        <Outlet></Outlet>
    );
};

export default ProtectedRoute;
