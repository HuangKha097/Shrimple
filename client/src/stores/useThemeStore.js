import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { animateThemeChange } from '../lib/motion';

function applyTheme({ isLight, primaryColor }) {
    const root = document.documentElement;
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', !isLight);
    root.style.colorScheme = isLight ? 'light' : 'dark';
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
    isLight: true,
    primaryColor: '#e56d32',
    toggleTheme: () => get().setTheme(!get().isLight),
    setTheme: (isLight) => {
        const next = Boolean(isLight);
        if (next === get().isLight) return;
        set({ isLight: next });
        animateThemeChange(() => applyTheme(get()));
    },
    setPrimaryColor: (primaryColor) => {
        if (!/^#[0-9a-f]{6}$/i.test(primaryColor)) return;
        set({ primaryColor }); applyTheme(get());
    },
}), {
    name: 'theme-storage',
    onRehydrateStorage: () => state => { if (state) applyTheme(state); },
}));

// Apply persisted preferences before React paints the first screen.
applyTheme(useThemeStore.getState());
