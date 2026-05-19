import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import usePersistentState from './usePersistentState.js';

export default function useCategories() {
  const [categories, setCategories] = useState([]);
  const [current, setCurrent] = usePersistentState('media-merge-category', '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listCategories();
      const list = Array.isArray(data?.categories) ? data.categories : [];
      setCategories(list);
      setCurrent((stored) => {
        if (list.length === 0) return '';
        const hasStored = stored && list.some((c) => c.id === stored);
        return hasStored ? stored : list[0].id;
      });
    } catch (err) {
      console.error('Failed to load categories', err);
      setCategories([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [setCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const currentMeta = categories.find((c) => c.id === current) || null;

  return {
    categories,
    current,
    currentPath: currentMeta?.path || '',
    setCurrent,
    loading,
    error,
    reload: load
  };
}
