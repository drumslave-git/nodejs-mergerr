import { useEffect, useState } from 'react';

function readSessionValue(key, defaultValue) {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored === null) {
      return defaultValue;
    }
    return JSON.parse(stored);
  } catch (err) {
    return defaultValue;
  }
}

function usePersistantState(key, defaultValue) {
  const [value, setValue] = useState(() => readSessionValue(key, defaultValue));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Ignore storage errors (private mode, disabled storage, etc).
    }
  }, [key, value]);

  return [value, setValue];
}

export default usePersistantState;
