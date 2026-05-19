import React from 'react';

function MergePanel({
  mediaItems,
  mediaMessage,
  pendingMergeId,
  isMergeRunning,
  onMerge,
  logText,
  logRef,
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange
}) {
  const query = (search || '').trim().toLowerCase();
  const visibleItems = mediaItems.filter((media) => {
    if (hideUnavailable && media.mergeable === false) {
      return false;
    }
    if (!query) return true;
    const name = (media.name || '').toLowerCase();
    const path = (media.id || '').toLowerCase();
    return name.includes(query) || path.includes(query);
  });
  const isFiltering = Boolean(query) || hideUnavailable;

  return (
    <>
      <p>
        Select a category to scan for multi-part media. A multi-part media item is defined as a
        directory containing two or more video files. When you press <strong>Merge</strong>, the
        files will be concatenated in order of their file names using ffmpeg&apos;s concat demuxer.
      </p>
      <div className="list-filter">
        <input
          type="search"
          className="list-filter-search"
          placeholder="Search by name or path..."
          value={search || ''}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Search merge items"
        />
        <label className="list-filter-toggle">
          <input
            type="checkbox"
            checked={Boolean(hideUnavailable)}
            onChange={(event) => onHideUnavailableChange(event.target.checked)}
          />
          Hide non-mergeable
        </label>
        {isFiltering && mediaItems.length > 0 ? (
          <span className="list-filter-count muted">
            {visibleItems.length} of {mediaItems.length} shown
          </span>
        ) : null}
      </div>
      <div id="media">
        {mediaItems.length === 0 ? (
          <p>{mediaMessage}</p>
        ) : visibleItems.length === 0 ? (
          <p>No items match the current filters.</p>
        ) : (
          visibleItems.map((media) => {
            const allFiles =
              media.filesAll && media.filesAll.length ? media.filesAll : media.files || [];
            const videoCount = (media.files && media.files.length) || 0;
            const unavailable =
              media.available === false || media.mergeable === false || isMergeRunning;
            const isPending = pendingMergeId === media.id;
            const buttonLabel = isPending ? 'Merging...' : unavailable ? 'Not mergeable' : 'Merge';

            return (
              <div className="media-item" key={media.id}>
                <div className="media-header">
                  <span className="media-title">{media.name}</span>
                  <button
                    type="button"
                    disabled={unavailable || isPending}
                    onClick={() => onMerge(media)}
                  >
                    {buttonLabel}
                  </button>
                </div>
                <div className="details">
                  <div>Path: {media.id}</div>
                  <div>Merged file: {media.name}.mp4</div>
                  <div>
                    Status: {media.outputExists ? 'Already merged' : 'Not merged yet'}
                  </div>
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
          })
        )}
      </div>
      <h2>Merge Log</h2>
      <pre id="log" className="log" ref={logRef}>
        {logText}
      </pre>
    </>
  );
}

export default MergePanel;
