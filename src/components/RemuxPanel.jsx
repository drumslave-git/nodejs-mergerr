import React from 'react';

function RemuxPanel({
  remuxItems,
  remuxMessage,
  pendingRemuxId,
  expandedRemuxGroups,
  onToggleGroup,
  onRemuxAll,
  logText,
  logRef
}) {
  return (
    <div className="remux-panel">
      <h2>External Audio Remux</h2>
      <p>Remux external audio tracks into a single MKV file alongside the main video.</p>
      <div id="remux">
        {remuxItems.length === 0 ? (
          <p>{remuxMessage}</p>
        ) : (
          remuxItems.map((group) => {
            const items = Array.isArray(group.items) ? group.items : [];
            const remuxableItems = items.filter((item) => item.remuxable);
            const unavailable =
              group.available === false || items.length === 0 || remuxableItems.length === 0;
            const isPending = pendingRemuxId === group.id;
            const buttonLabel = isPending
              ? 'Remuxing...'
              : unavailable
                ? 'Not remuxable'
                : 'Remux all';
            const isExpanded = expandedRemuxGroups.has(group.id);

            return (
              <div className="media-item" key={group.id}>
                <div className="media-header">
                  <div className="media-title">
                    <button
                      type="button"
                      className="toggle-button"
                      aria-expanded={isExpanded}
                      aria-controls={`remux-group-${group.id}`}
                      onClick={() => onToggleGroup(group.id)}
                    >
                      {isExpanded ? 'Hide' : 'Show'}
                    </button>
                    <span>{group.name}</span>
                  </div>
                  <button
                    type="button"
                    disabled={unavailable || isPending}
                    onClick={() => onRemuxAll(group)}
                  >
                    {buttonLabel}
                  </button>
                </div>
                <div className="details">
                  <div>Path: {group.path || group.id}</div>
                  <div>
                    Episodes: {items.length} - remuxable: {remuxableItems.length}
                  </div>
                  {group.warning ? <div className="note">{group.warning}</div> : null}
                  {items.length && isExpanded ? (
                    <div className="remux-episodes" id={`remux-group-${group.id}`}>
                      {items.map((item) => {
                        const audioCount = (item.audioFiles && item.audioFiles.length) || 0;
                        return (
                          <div className="remux-episode" key={item.id}>
                            <div className="remux-episode-title">{item.name}</div>
                            <div className="muted">
                              Audio tracks: {audioCount} - Output: {item.outputPath || 'N/A'}
                            </div>
                            {item.warning ? <div className="note">{item.warning}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <h2>Remux Log</h2>
      <pre id="remux-log" className="log" ref={logRef}>
        {logText}
      </pre>
    </div>
  );
}

export default RemuxPanel;
