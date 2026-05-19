import React, { useMemo } from 'react';
import ListFilter from './ListFilter.jsx';
import LogView from './LogView.jsx';

function matchesQuery(group, query) {
  if (!query) return true;
  return (
    (group.name || '').toLowerCase().includes(query) ||
    (group.path || group.id || '').toLowerCase().includes(query)
  );
}

function RemuxEpisode({ item }) {
  const audioCount = item.audioFiles?.length || 0;
  const audioTracks = Array.isArray(item.audioTracks)
    ? item.audioTracks
    : (item.audioFiles || []).map((filePath) => ({ path: filePath, label: '' }));

  return (
    <div className="remux-episode">
      <div className="remux-episode-title">{item.name}</div>
      <div className="muted">
        Audio tracks: {audioCount}
        <br />
        Output: {item.outputPath || 'N/A'}
      </div>
      <div className="muted">
        Status: {item.outputExists ? 'Already remuxed' : 'Not remuxed yet'}
      </div>
      {audioTracks.length ? (
        <ul className="file-list">
          {audioTracks.map((track) => (
            <li key={track.path}>
              {track.label ? `${track.label} - ` : ''}
              {track.path}
            </li>
          ))}
        </ul>
      ) : null}
      {item.warning ? <div className="note">{item.warning}</div> : null}
    </div>
  );
}

function RemuxGroup({ group, isPending, isBlocked, isExpanded, onToggle, onRemuxAll }) {
  const items = Array.isArray(group.items) ? group.items : [];
  const remuxableCount = items.filter((item) => item.remuxable).length;
  const processedCount = items.filter((item) => item.outputExists).length;
  const unavailable =
    group.available === false || items.length === 0 || remuxableCount === 0 || isBlocked;
  const label = isPending ? 'Remuxing...' : unavailable ? 'Not remuxable' : 'Remux all';
  const sectionId = `remux-group-${group.id}`;

  return (
    <div className="media-item">
      <div className="media-header">
        <div className="media-title">
          <button
            type="button"
            className="toggle-button"
            aria-expanded={isExpanded}
            aria-controls={sectionId}
            onClick={() => onToggle(group.id)}
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
          {label}
        </button>
      </div>
      <div className="details">
        <div>Path: {group.path || group.id}</div>
        <div>
          Episodes: {items.length} - remuxable: {remuxableCount} - processed: {processedCount}
        </div>
        {group.warning ? <div className="note">{group.warning}</div> : null}
        {items.length && isExpanded ? (
          <div className="remux-episodes" id={sectionId}>
            {items.map((item) => (
              <RemuxEpisode key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RemuxPanel({
  remuxItems,
  remuxMessage,
  pendingRemuxId,
  isRemuxRunning,
  expandedGroups,
  onToggleGroup,
  onRemuxAll,
  logText,
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange
}) {
  const query = (search || '').trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      remuxItems.filter((group) => {
        if (hideUnavailable) {
          const items = Array.isArray(group.items) ? group.items : [];
          if (!items.some((item) => item.remuxable)) return false;
        }
        return matchesQuery(group, query);
      }),
    [remuxItems, hideUnavailable, query]
  );

  return (
    <div className="remux-panel">
      <h2>External Audio Remux</h2>
      <p>Remux external audio tracks into a single MKV file alongside the main video.</p>
      <ListFilter
        search={search}
        onSearchChange={onSearchChange}
        hideUnavailable={hideUnavailable}
        onHideUnavailableChange={onHideUnavailableChange}
        hideUnavailableLabel="Hide non-remuxable"
        visibleCount={visibleItems.length}
        totalCount={remuxItems.length}
        searchAriaLabel="Search remux items"
      />
      <div id="remux">
        {remuxItems.length === 0 ? (
          <p>{remuxMessage}</p>
        ) : visibleItems.length === 0 ? (
          <p>No items match the current filters.</p>
        ) : (
          visibleItems.map((group) => (
            <RemuxGroup
              key={group.id}
              group={group}
              isPending={pendingRemuxId === group.id}
              isBlocked={isRemuxRunning}
              isExpanded={expandedGroups.has(group.id)}
              onToggle={onToggleGroup}
              onRemuxAll={onRemuxAll}
            />
          ))
        )}
      </div>
      <LogView id="remux-log" title="Remux Log" logText={logText} />
    </div>
  );
}

export default RemuxPanel;
