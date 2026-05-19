import { useCallback, useRef, useState } from 'react';
import useEventStream from './useEventStream.js';

/**
 * Tracks a single in-flight ffmpeg job:
 *   - `start(jobIdentifier, startFn)` calls the supplied API starter and
 *     captures the returned `{ channel }`.
 *   - Live SSE `log` events for the active channel are appended to `logText`.
 *   - An SSE `done` event clears the pending state and fires `onComplete`.
 *
 * `jobIdentifier` is the client-side id (e.g. media.id) used to show the
 * spinner on the correct row in the UI.
 */
export default function useJob({ onComplete } = {}) {
  const [logText, setLogText] = useState('');
  const [channel, setChannel] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEventStream({
    onLog: (payload) => {
      if (!payload?.channel || !payload?.message) return;
      setChannel((current) => {
        if (current && payload.channel === current) {
          setLogText((prev) => prev + payload.message);
        }
        return current;
      });
    },
    onDone: (payload) => {
      if (!payload?.channel) return;
      setChannel((current) => {
        if (current === payload.channel) {
          setPendingId(null);
          onCompleteRef.current?.(payload);
        }
        return current;
      });
    }
  });

  const start = useCallback(async (jobIdentifier, startFn) => {
    setLogText('');
    setChannel(null);
    setPendingId(jobIdentifier);
    try {
      const data = await startFn();
      if (data?.channel) {
        setChannel(data.channel);
      } else {
        setPendingId(null);
      }
      return data;
    } catch (err) {
      setPendingId(null);
      throw err;
    }
  }, []);

  const clear = useCallback(() => setLogText(''), []);

  return { logText, pendingId, isRunning: pendingId !== null, start, clear };
}
