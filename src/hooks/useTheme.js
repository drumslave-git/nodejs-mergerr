import { useEffect } from 'react';
import usePersistentState from './usePersistentState.js';

export default function useTheme() {
  const [theme, setTheme] = usePersistentState('media-merge-theme', 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return [theme, setTheme];
}
