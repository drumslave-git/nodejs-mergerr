import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const STICKY_THRESHOLD_PX = 40;
const COPIED_FEEDBACK_MS = 1500;

function LogView({ title = 'Log', logText, onClear, busy }) {
  const ref = useRef(null);
  const isStickyRef = useRef(true);
  const [copied, setCopied] = useState(false);
  const hasContent = logText.length > 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isStickyRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logText]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isStickyRef.current = distanceFromBottom < STICKY_THRESHOLD_PX;
  };

  const handleCopy = async () => {
    if (!hasContent) return;
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (err) {
      console.error('Failed to copy log', err);
    }
  };

  return (
    <section className="log-panel" aria-label={title}>
      <header className="log-panel__header">
        <div className="log-panel__title">
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          <span>{title}</span>
        </div>
        <div className="log-panel__actions">
          <button
            type="button"
            className="icon-button"
            onClick={handleCopy}
            disabled={!hasContent}
            title={copied ? 'Copied!' : 'Copy log'}
            aria-label="Copy log"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClear}
            disabled={!hasContent}
            title="Clear log"
            aria-label="Clear log"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>
      <pre
        className={`log${hasContent ? '' : ' log--empty'}`}
        ref={ref}
        onScroll={handleScroll}
      >
        {hasContent ? logText : 'No output yet. Start a job to see ffmpeg logs here.'}
      </pre>
    </section>
  );
}

export default LogView;
