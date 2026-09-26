import React, {useEffect, useState} from 'react';
import {useAuthStore} from "../stores/useAuthStore.js";
import {Navigate, Outlet} from "react-router";

import LoadingSpin from "../components/common/loading/LoadingSpin.jsx";

const ProtectedRoute = () => {
    const {accessToken, user, loading, refresh, fetchMe, connectSocket} = useAuthStore()
    const [starting, setStarting] = useState(true);

    const init = async () => {
        if (!accessToken) {
            await refresh()
        }
        if (accessToken && !user) {
            await fetchMe();
        } else if (user) {
            connectSocket();
        }

        setStarting(false);
    }

    useEffect(() => {
        init()
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