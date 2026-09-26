import React from 'react';
import LoadingSpin from './loading/LoadingSpin';
import { useUIStore } from '../../stores/useUIStore';

const GlobalLoadingOverlay = () => {
    const { isGlobalLoading, isOffline } = useUIStore();

    if (!isGlobalLoading && !isOffline) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#e7e9ea'
        }}>
            <LoadingSpin size={36} strokeWidth={3} />
            {isOffline && (
                <p style={{
                    marginTop: '16px',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#e7e9ea',
                    letterSpacing: '-0.01em'
                }}>
                    Mất kết nối mạng
                </p>
            )}
        </div>
    );
};

export default GlobalLoadingOverlay;
