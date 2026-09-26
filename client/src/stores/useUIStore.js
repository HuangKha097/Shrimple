import { create } from 'zustand';

export const useUIStore = create((set) => ({
    isGlobalLoading: false,
    loadingRequestCount: 0,
    isOffline: !navigator.onLine,
    
    setOffline: (status) => set({ isOffline: status }),
    
    startLoading: () => set((state) => ({ 
        isGlobalLoading: true, 
        loadingRequestCount: state.loadingRequestCount + 1 
    })),
    
    stopLoading: () => set((state) => {
        const newCount = Math.max(0, state.loadingRequestCount - 1);
        return { 
            loadingRequestCount: newCount,
            isGlobalLoading: newCount > 0
        };
    }),
}));
