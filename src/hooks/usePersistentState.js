import { useEffect, useState } from 'react';

function read(key, defaultValue) {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
}

function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(() => read(key, defaultValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage errors (private mode, disabled storage, etc.)
    }
  }, [key, value]);

  return [value, setValue];
}

export default usePersistentState;
