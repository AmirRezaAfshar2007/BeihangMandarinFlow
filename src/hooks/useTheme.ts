import { useEffect, useState, useCallback } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

// While this class sits on <html>, every transition on the page is disabled
// (see the matching rule in index.css). The theme swap re-colors a LOT of
// elements at once; without this the browser tries to animate all of them
// simultaneously and the toggle stutters. With it, the new palette lands in
// a single frame, then transitions are re-enabled right after.
const NO_TRANSITIONS_CLASS = 'no-animations-on-theme-switch';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    // localStorage unavailable (e.g. private mode) - fall back to default
  }
  return 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.add(NO_TRANSITIONS_CLASS);
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // ignore persistence failures
    }

    // Wait two frames so the browser has definitely painted the new theme,
    // then let normal hover transitions work again. Nothing animates on the
    // way out because all colors already settled during the frozen frames.
    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        root.classList.remove(NO_TRANSITIONS_CLASS);
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      // Safety net in case the component unmounts before the frames fire.
      root.classList.remove(NO_TRANSITIONS_CLASS);
    };
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
