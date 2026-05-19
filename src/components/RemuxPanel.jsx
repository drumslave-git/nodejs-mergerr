import React, { useMemo } from 'react';
import Badge from './Badge.jsx';
import Icon from './Icon.jsx';
import ListFilter from './ListFilter.jsx';
import LogView from './LogView.jsx';
import Spinner from './Spinner.jsx';

const MIN_THREADS = 1;
const MAX_THREADS = 16;

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
    <div className="episode">
      <div className="episode__title">
        <span>{item.name}</span>
        {item.outputExists ? (
          <Badge variant="success">Done</Badge>
        ) : item.remuxable ? (
          <Badge variant="accent">{audioCount} audio</Badge>
        ) : (
          <Badge variant="warn">No audio match</Badge>
        )}
      </div>
      <div className="episode__meta episode__output">
        Output: {item.outputPath || 'N/A'}
      </div>
      {audioTracks.length ? (
        <ul className="file-list">
          {audioTracks.map((track) => (
            <li key={track.path}>
              {track.label ? `${track.label} — ` : ''}
              {track.path}
            </li>
          ))}
        </ul>
      ) : null}
      {item.warning ? (
        <div className="card__note">
          <Icon name="warning" size={14} />
          <span>{item.warning}</span>
        </div>
      ) : null}
    </div>
  );
}

function GroupStatusBadges({ remuxable, processed, total }) {
  if (total === 0) {
    return <Badge variant="warn">No videos</Badge>;
  }
  if (remuxable === 0) {
    return <Badge variant="warn">No audio matches</Badge>;
  }
  if (processed === total) {
    return <Badge variant="success">All processed</Badge>;
  }
  return (
    <>
      <Badge variant="accent">{remuxable} remuxable</Badge>
      {processed > 0 ? <Badge variant="success">{processed} done</Badge> : null}
    </>
  );
}

function RemuxGroup({ group, isPending, isBlocked, isExpanded, onToggle, onRemuxAll }) {
  const items = Array.isArray(group.items) ? group.items : [];
  const remuxableCount = items.filter((item) => item.remuxable).length;
  const processedCount = items.filter((item) => item.outputExists).length;
  const unavailable =
    group.available === false || items.length === 0 || remuxableCount === 0 || isBlocked;
  const buttonLabel = isPending ? 'Remuxing' : unavailable ? 'Not remuxable' : 'Remux all';
  const sectionId = `remux-group-${group.id}`;

  return (
    <article className="card">
      <div className="card__header">
        <div className="card__title-block">
          <div className="card__title">
            <span>{group.name}</span>
            <GroupStatusBadges
              remuxable={remuxableCount}
              processed={processedCount}
              total={items.length}
            />
          </div>
          <div className="card__path" title={group.path || group.id}>
            {group.path || group.id}
          </div>
        </div>
        <div className="card__actions">
          <button
            type="button"
            className="button"
            disabled={unavailable || isPending}
            onClick={() => onRemuxAll(group)}
          >
            {isPending ? <Spinner /> : null}
            <span>{buttonLabel}</span>
          </button>
        </div>
      </div>

      <div className="card__meta">
        <span>
          <strong>{items.length}</strong> episodes
        </span>
        <span>
          <strong>{remuxableCount}</strong> with external audio
        </span>
        <span>
          <strong>{processedCount}</strong> already done
        </span>
      </div>

      <div className="card__footer">
        <button
          type="button"
          className="link-button"
          aria-expanded={isExpanded}
          aria-controls={sectionId}
          onClick={() => onToggle(group.id)}
          disabled={items.length === 0}
        >
          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={12} />
          <span style={{ marginLeft: 4 }}>
            {isExpanded ? 'Hide episodes' : `Show episodes (${items.length})`}
          </span>
        </button>
      </div>

      {group.warning ? (
        <div className="card__note">
          <Icon name="warning" size={14} />
          <span>{group.warning}</span>
        </div>
      ) : null}

      {items.length && isExpanded ? (
        <div className="episodes" id={sectionId}>
          {items.map((item) => (
            <RemuxEpisode key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ThreadsInput({ value, onChange, disabled }) {
  return (
    <label className="number-input">
      <span>Threads</span>
      <input
        type="number"
        min={MIN_THREADS}
        max={MAX_THREADS}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isFinite(parsed)) return;
          onChange(Math.max(MIN_THREADS, Math.min(parsed, MAX_THREADS)));
        }}
      />
    </label>
  );
}

function RemuxPanel({
  remuxItems,
  remuxMessage,
  remuxLoading,
  pendingRemuxId,
  isRemuxRunning,
  expandedGroups,
  onToggleGroup,
  onRemuxAll,
  threads,
  onThreadsChange,
  logText,
  onLogClear,
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange,
  hideProcessed,
  onHideProcessedChange
}) {
  const query = (search || '').trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      remuxItems.filter((group) => {
        const items = Array.isArray(group.items) ? group.items : [];
        if (hideUnavailable && !items.some((item) => item.remuxable)) return false;
        if (hideProcessed) {
          const remuxable = items.filter((item) => item.remuxable);
          if (remuxable.length > 0 && remuxable.every((item) => item.outputExists)) {
            return false;
          }
        }
        return matchesQuery(group, query);
      }),
    [remuxItems, hideUnavailable, hideProcessed, query]
  );

  return (
    <div className="tab-panel">
      <div className="tab-panel__body">
      <p className="muted">
        Combines a video file with its matching external audio tracks (e.g. <code>.aac</code>,{' '}
        <code>.mka</code>) into a single MKV. Uses <code>-c copy</code>, so no re-encoding.
      </p>

      <ListFilter
        search={search}
        onSearchChange={onSearchChange}
        hideUnavailable={hideUnavailable}
        onHideUnavailableChange={onHideUnavailableChange}
        hideUnavailableLabel="Hide non-remuxable"
        hideProcessed={hideProcessed}
        onHideProcessedChange={onHideProcessedChange}
        visibleCount={visibleItems.length}
        totalCount={remuxItems.length}
        searchAriaLabel="Search remux items"
        trailing={
          <ThreadsInput value={threads} onChange={onThreadsChange} disabled={isRemuxRunning} />
        }
      />

      {remuxLoading ? (
        <div className="empty empty--loading">
          <Spinner /> <span>Scanning category...</span>
        </div>
      ) : remuxItems.length === 0 ? (
        <div className="empty">{remuxMessage}</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty">No items match the current filters.</div>
      ) : (
        <div className="card-list">
          {visibleItems.map((group) => (
            <RemuxGroup
              key={group.id}
              group={group}
              isPending={pendingRemuxId === group.id}
              isBlocked={isRemuxRunning}
              isExpanded={expandedGroups.has(group.id)}
              onToggle={onToggleGroup}
              onRemuxAll={onRemuxAll}
            />
          ))}
        </div>
      )}
      </div>

      <div className="log-dock">
        <LogView
          title="Remux log"
          logText={logText}
          onClear={onLogClear}
          busy={isRemuxRunning}
        />
      </div>
    </div>
  );
}

export default RemuxPanel;
