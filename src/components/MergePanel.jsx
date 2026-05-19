import React, { useMemo, useState } from 'react';
import Badge from './Badge.jsx';
import Icon from './Icon.jsx';
import ListFilter from './ListFilter.jsx';
import LogView from './LogView.jsx';
import Spinner from './Spinner.jsx';

function matchesQuery(media, query) {
  if (!query) return true;
  return (
    (media.name || '').toLowerCase().includes(query) ||
    (media.id || '').toLowerCase().includes(query)
  );
}

function StatusBadge({ media }) {
  if (media.mergeable === false) {
    return <Badge variant="warn">Not mergeable</Badge>;
  }
  if (media.outputExists) {
    return <Badge variant="success">Already merged</Badge>;
  }
  return <Badge>Pending merge</Badge>;
}

function MergeItem({ media, isPending, isBlocked, onMerge }) {
  const [expanded, setExpanded] = useState(false);
  const allFiles = media.filesAll?.length ? media.filesAll : media.files || [];
  const videoCount = media.files?.length || 0;
  const unavailable = media.available === false || media.mergeable === false || isBlocked;
  const buttonLabel = isPending ? 'Merging' : unavailable ? 'Not mergeable' : 'Merge';

  return (
    <article className="card">
      <div className="card__header">
        <div className="card__title-block">
          <div className="card__title">
            <span>{media.name}</span>
            <StatusBadge media={media} />
          </div>
          <div className="card__path" title={media.id}>
            {media.id}
          </div>
        </div>
        <div className="card__actions">
          <button
            type="button"
            className="button"
            disabled={unavailable || isPending}
            onClick={() => onMerge(media)}
          >
            {isPending ? <Spinner /> : null}
            <span>{buttonLabel}</span>
          </button>
        </div>
      </div>

      <div className="card__meta">
        <span>
          <strong>{allFiles.length}</strong> files
        </span>
        <span>
          <strong>{videoCount}</strong> video parts
        </span>
        <span>
          Output: <strong>{media.name}.mp4</strong>
        </span>
      </div>

      <div className="card__footer">
        <button
          type="button"
          className="link-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
          <span style={{ marginLeft: 4 }}>
            {expanded ? 'Hide files' : `Show files (${allFiles.length})`}
          </span>
        </button>
      </div>

      {expanded ? (
        <ul className={`file-list${allFiles.length === 0 ? ' file-list--empty' : ''}`}>
          {allFiles.length ? (
            allFiles.map((filePath) => <li key={filePath}>{filePath}</li>)
          ) : (
            <li>No parts found.</li>
          )}
        </ul>
      ) : null}

      {media.warning ? (
        <div className="card__note">
          <Icon name="warning" size={14} />
          <span>{media.warning}</span>
        </div>
      ) : null}
    </article>
  );
}

function MergePanel({
  mediaItems,
  mediaMessage,
  mediaLoading,
  pendingMergeId,
  isMergeRunning,
  onMerge,
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
      mediaItems.filter((media) => {
        if (hideUnavailable && media.mergeable === false) return false;
        if (hideProcessed && media.outputExists) return false;
        return matchesQuery(media, query);
      }),
    [mediaItems, hideUnavailable, hideProcessed, query]
  );

  return (
    <div className="tab-panel">
      <div className="tab-panel__body">
      <p className="muted">
        Concatenates multi-part torrents (e.g. <code>CD1.mkv</code> + <code>CD2.mkv</code>) into a
        single <code>.mp4</code> using ffmpeg&apos;s concat demuxer, without re-encoding.
      </p>

      <ListFilter
        search={search}
        onSearchChange={onSearchChange}
        hideUnavailable={hideUnavailable}
        onHideUnavailableChange={onHideUnavailableChange}
        hideUnavailableLabel="Hide non-mergeable"
        hideProcessed={hideProcessed}
        onHideProcessedChange={onHideProcessedChange}
        visibleCount={visibleItems.length}
        totalCount={mediaItems.length}
        searchAriaLabel="Search merge items"
      />

      {mediaLoading ? (
        <div className="empty empty--loading">
          <Spinner /> <span>Scanning category...</span>
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="empty">{mediaMessage}</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty">No items match the current filters.</div>
      ) : (
        <div className="card-list">
          {visibleItems.map((media) => (
            <MergeItem
              key={media.id}
              media={media}
              isPending={pendingMergeId === media.id}
              isBlocked={isMergeRunning}
              onMerge={onMerge}
            />
          ))}
        </div>
      )}
      </div>

      <div className="log-dock">
        <LogView
          title="Merge log"
          logText={logText}
          onClear={onLogClear}
          busy={isMergeRunning}
        />
      </div>
    </div>
  );
}

export default MergePanel;
