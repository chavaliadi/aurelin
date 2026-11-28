'use client';

import { useEffect, useSyncExternalStore } from 'react';

const THEME_EVENT = 'cv-theme-change';

function subscribeTheme(callback: () => void) {
    window.addEventListener('storage', callback);
    window.addEventListener(THEME_EVENT, callback);
    return () => {
        window.removeEventListener('storage', callback);
        window.removeEventListener(THEME_EVENT, callback);
    };
}

function getThemeSnapshot(): 'dark' | 'light' {
    const saved = localStorage.getItem('cv_theme');
    return saved === 'light' ? 'light' : 'dark';
}

function getServerThemeSnapshot(): 'dark' | 'light' {
    return 'dark';
}

export default function ThemeToggle() {
    const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    }, [theme]);

    function toggle() {
        const next = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('cv_theme', next);
        window.dispatchEvent(new Event(THEME_EVENT));
    }

    return (
        <button
            className="theme-toggle-btn"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? '☀️' : '🌙'}
        </button>
    );
}
