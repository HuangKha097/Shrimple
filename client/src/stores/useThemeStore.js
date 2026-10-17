import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function applyTheme({ primaryColor }) {
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
    const color = /^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : '#e56d32';
    const rgb = color.slice(1).match(/../g).map(value => parseInt(value, 16));
    const luminance = rgb.map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    root.style.setProperty('--primary-color', color);
    root.style.setProperty('--primary-rgb', rgb.join(', '));
    root.style.setProperty('--on-primary', luminance > .179 ? '#000000' : '#ffffff');
}

export const useThemeStore = create(persist((set, get) => ({
    isLight: false,
    primaryColor: '#e56d32',
    setPrimaryColor: (primaryColor) => {
        if (!/^#[0-9a-f]{6}$/i.test(primaryColor)) return;
        set({ primaryColor }); applyTheme(get());
    },
}), {
    name: 'theme-storage',
    partialize: (state) => ({ primaryColor: state.primaryColor }),
    merge: (persisted, current) => ({
        ...current,
        primaryColor: /^#[0-9a-f]{6}$/i.test(persisted?.primaryColor) ? persisted.primaryColor : current.primaryColor,
        isLight: false,
    }),
    onRehydrateStorage: () => state => { if (state) applyTheme(state); },
}));

// Apply persisted preferences before React paints the first screen.
applyTheme(useThemeStore.getState());
