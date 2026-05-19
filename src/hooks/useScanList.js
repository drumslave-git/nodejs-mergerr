import { useCallback, useEffect, useState } from 'react';

const INITIAL_MESSAGE = 'Loading categories...';

/**
 * Generic scan-list loader. `fetcher` is a function `(categoryId) => Promise<array>`.
 * `messages` lets callers customize the empty-state copy.
 */
export default function useScanList(categoryId, fetcher, messages = {}) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState(messages.initial || INITIAL_MESSAGE);
  const [loading, setLoading] = useState(false);

  const empty = messages.empty || 'No items found.';
  const failed = messages.failed || 'Failed to load items.';
  const prompt = messages.prompt || 'Select a category to scan.';
  const scanning = messages.scanning || 'Scanning...';

  const load = useCallback(
    async (id) => {
      if (!id) {
        setItems([]);
        setMessage(prompt);
        return;
      }
      setItems([]);
      setMessage(scanning);
      setLoading(true);
      try {
        const list = await fetcher(id);
        setItems(Array.isArray(list) ? list : []);
        if (!list || list.length === 0) setMessage(empty);
      } catch (err) {
        console.error('Scan failed', err);
        setItems([]);
        setMessage(failed);
      } finally {
        setLoading(false);
      }
    },
    [fetcher, prompt, scanning, empty, failed]
  );

  useEffect(() => {
    load(categoryId);
  }, [categoryId, load]);

  return { items, message, loading, reload: () => load(categoryId) };
}
