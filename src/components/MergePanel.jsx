import React, { useMemo } from 'react';
import ListFilter from './ListFilter.jsx';
import LogView from './LogView.jsx';

function matchesQuery(media, query) {
  if (!query) return true;
  return (
    (media.name || '').toLowerCase().includes(query) ||
    (media.id || '').toLowerCase().includes(query)
  );
}

function MergeItem({ media, isPending, isBlocked, onMerge }) {
  const allFiles = media.filesAll?.length ? media.filesAll : media.files || [];
  const videoCount = media.files?.length || 0;
  const unavailable = media.available === false || media.mergeable === false || isBlocked;
  const label = isPending ? 'Merging...' : unavailable ? 'Not mergeable' : 'Merge';

  return (
    <div className="media-item">
      <div className="media-header">
        <span className="media-title">{media.name}</span>
        <button type="button" disabled={unavailable || isPending} onClick={() => onMerge(media)}>
          {label}
        </button>
      </div>
      <div className="details">
        <div>Path: {media.id}</div>
        <div>Merged file: {media.name}.mp4</div>
        <div>Status: {media.outputExists ? 'Already merged' : 'Not merged yet'}</div>
        <div>
          Files ({allFiles.length}) - videos: {videoCount}
        </div>
        <ul className="file-list">
          {allFiles.length ? (
            allFiles.map((filePath) => <li key={filePath}>{filePath}</li>)
          ) : (
            <li>No parts found.</li>
          )}
        </ul>
        {media.warning ? <div className="note">{media.warning}</div> : null}
      </div>
    </div>
  );
}

function MergePanel({
  mediaItems,
  mediaMessage,
  pendingMergeId,
  isMergeRunning,
  onMerge,
  logText,
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange
}) {
  const query = (search || '').trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      mediaItems.filter((media) => {
        if (hideUnavailable && media.mergeable === false) return false;
        return matchesQuery(media, query);
      }),
    [mediaItems, hideUnavailable, query]
  );

  return (
    <>
      <p>
        Select a category to scan for multi-part media. A multi-part media item is defined as a
        directory containing two or more video files. When you press <strong>Merge</strong>, the
        files will be concatenated in order of their file names using ffmpeg&apos;s concat demuxer.
      </p>
      <ListFilter
        search={search}
        onSearchChange={onSearchChange}
        hideUnavailable={hideUnavailable}
        onHideUnavailableChange={onHideUnavailableChange}
        hideUnavailableLabel="Hide non-mergeable"
        visibleCount={visibleItems.length}
        totalCount={mediaItems.length}
        searchAriaLabel="Search merge items"
      />
      <div id="media">
        {mediaItems.length === 0 ? (
          <p>{mediaMessage}</p>
        ) : visibleItems.length === 0 ? (
          <p>No items match the current filters.</p>
        ) : (
          visibleItems.map((media) => (
            <MergeItem
              key={media.id}
              media={media}
              isPending={pendingMergeId === media.id}
              isBlocked={isMergeRunning}
              onMerge={onMerge}
            />
          ))
        )}
      </div>
      <LogView id="log" title="Merge Log" logText={logText} />
    </>
  );
}

export default MergePanel;
