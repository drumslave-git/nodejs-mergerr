import { useEffect, useRef } from 'react';

/**
 * Connects to the SSE endpoint exactly once for the lifetime of the consumer
 * and forwards `log` / `done` payloads to the latest handlers.
 */
export default function useEventStream({ onLog, onDone } = {}) {
  const handlersRef = useRef({ onLog, onDone });
  handlersRef.current = { onLog, onDone };

  useEffect(() => {
    const source = new EventSource('/events');

    const handle = (handlerName) => (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        handlersRef.current[handlerName]?.(payload);
      } catch (err) {
        console.error(`Failed to parse ${handlerName} event`, err);
      }
    };

    const onLogEvent = handle('onLog');
    const onDoneEvent = handle('onDone');

    source.addEventListener('log', onLogEvent);
    source.addEventListener('done', onDoneEvent);
    source.onerror = (err) => console.error('EventSource failed:', err);

    return () => {
      source.removeEventListener('log', onLogEvent);
      source.removeEventListener('done', onDoneEvent);
      source.close();
    };
  }, []);
}
