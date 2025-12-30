import React, { useEffect, useRef, useState } from 'react';

function App() {
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('');
  const [categoryPath, setCategoryPath] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaMessage, setMediaMessage] = useState('Loading categories...');
  const [remuxItems, setRemuxItems] = useState([]);
  const [remuxMessage, setRemuxMessage] = useState('Loading remux list...');
  const [logText, setLogText] = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [pendingMergeId, setPendingMergeId] = useState(null);
  const [pendingRemuxId, setPendingRemuxId] = useState(null);
  const [activeTab, setActiveTab] = useState('merge');
  const [expandedRemuxGroups, setExpandedRemuxGroups] = useState(() => new Set());
  const currentChannelRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  useEffect(() => {
    const source = new EventSource('/events');
    source.addEventListener('log', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.channel && payload.message) {
          if (currentChannelRef.current && payload.channel === currentChannelRef.current) {
            setLogText((prev) => prev + payload.message);
          }
        }
      } catch (err) {
        console.error('Failed to parse log event', err);
      }
    });

    source.onerror = (err) => {
      console.error('EventSource failed:', err);
    };

    return () => source.close();
  }, []);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      const list = Array.isArray(data?.categories) ? data.categories : [];
      setCategories(list);
      if (list.length === 0) {
        setCurrentCategory('');
        setCategoryPath('');
        setMediaItems([]);
        setMediaMessage('No categories configured.');
        return;
      }
      const initial = list[0].id;
      setCurrentCategory(initial);
      setCategoryPath(list[0].path || '');
      await fetchMedia(initial);
      await fetchRemux(initial);
    } catch (err) {
      console.error('Failed to load categories', err);
      setMediaItems([]);
      setMediaMessage('Failed to load categories.');
      setRemuxItems([]);
      setRemuxMessage('Failed to load categories.');
    }
  }

  async function fetchMedia(categoryId) {
    if (!categoryId) {
      setMediaItems([]);
      setMediaMessage('Select a category to scan.');
      return;
    }
    setMediaItems([]);
    setMediaMessage('Scanning...');
    try {
      const res = await fetch(`/api/media?category=${encodeURIComponent(categoryId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setMediaItems(list);
      if (list.length === 0) {
        setMediaMessage('No multi-part folders found.');
      }
    } catch (err) {
      console.error('Failed to load media', err);
      setMediaItems([]);
      setMediaMessage('Failed to load media.');
    }
  }

  async function fetchRemux(categoryId) {
    if (!categoryId) {
      setRemuxItems([]);
      setRemuxMessage('Select a category to scan.');
      return;
    }
    setRemuxItems([]);
    setRemuxMessage('Scanning...');
    try {
      const res = await fetch(`/api/remux?category=${encodeURIComponent(categoryId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRemuxItems(list);
      if (list.length === 0) {
        setRemuxMessage('No remuxable folders found.');
      }
    } catch (err) {
      console.error('Failed to load remux items', err);
      setRemuxItems([]);
      setRemuxMessage('Failed to load remux items.');
    }
  }

  async function handleMerge(media) {
    setLogText('');
    setCurrentChannel(null);
    setPendingMergeId(media.id);
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: media.id, category: currentCategory })
      });
      const data = await res.json();
      if (data && data.channel) {
        setCurrentChannel(data.channel);
      } else if (!res.ok) {
        console.error('Merge request failed', data);
      }
    } catch (err) {
      console.error('Failed to start merge', err);
    } finally {
      setTimeout(() => {
        setPendingMergeId((current) => (current === media.id ? null : current));
      }, 5000);
    }
  }

  async function handleRemuxAll(group) {
    setLogText('');
    setCurrentChannel(null);
    setPendingRemuxId(group.id);
    try {
      const res = await fetch('/api/remux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: group.id, category: currentCategory, mode: 'all' })
      });
      const data = await res.json();
      if (data && data.channel) {
        setCurrentChannel(data.channel);
      } else if (!res.ok) {
        console.error('Remux request failed', data);
      }
    } catch (err) {
      console.error('Failed to start remux', err);
    } finally {
      setTimeout(() => {
        setPendingRemuxId((current) => (current === group.id ? null : current));
      }, 5000);
    }
  }

  function toggleRemuxGroup(groupId) {
    setExpandedRemuxGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className="container">
      <h1>Multi-part Media Merger</h1>
      <div className="controls">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={currentCategory}
          onChange={(event) => {
            const next = event.target.value;
            setCurrentCategory(next);
            const selected = categories.find((category) => category.id === next);
            setCategoryPath(selected?.path || '');
            fetchMedia(next);
            fetchRemux(next);
          }}
          disabled={categories.length === 0}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            activeTab === 'merge' ? fetchMedia(currentCategory) : fetchRemux(currentCategory)
          }
        >
          Refresh
        </button>
        {categoryPath ? <span className="muted">Path: {categoryPath}</span> : null}
      </div>
      <div className="tabs" role="tablist" aria-label="Merge options">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'merge'}
          className={`tab ${activeTab === 'merge' ? 'active' : ''}`}
          onClick={() => setActiveTab('merge')}
        >
          Multi-part files merger
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'remux'}
          className={`tab ${activeTab === 'remux' ? 'active' : ''}`}
          onClick={() => setActiveTab('remux')}
        >
          External Audio remux
        </button>
      </div>
      <div className="tab-panel">
        {activeTab === 'merge' ? (
          <>
            <p>
              Select a category to scan for multi-part media. A multi-part media item is defined as
              a directory containing two or more video files. When you press{' '}
              <strong>Merge</strong>, the files will be concatenated in order of their file names
              using ffmpeg&apos;s concat demuxer.
            </p>
            <div id="media">
              {mediaItems.length === 0 ? (
                <p>{mediaMessage}</p>
              ) : (
                mediaItems.map((media) => {
                  const allFiles =
                    media.filesAll && media.filesAll.length ? media.filesAll : media.files || [];
                  const videoCount = (media.files && media.files.length) || 0;
                  const unavailable = media.available === false || media.mergeable === false;
                  const isPending = pendingMergeId === media.id;
                  const buttonLabel = isPending
                    ? 'Merging...'
                    : unavailable
                      ? 'Not mergeable'
                      : 'Merge';

                  return (
                    <div className="media-item" key={media.id}>
                      <div className="media-header">
                        <span className="media-title">{media.name}</span>
                        <button
                          type="button"
                          disabled={unavailable || isPending}
                          onClick={() => handleMerge(media)}
                        >
                          {buttonLabel}
                        </button>
                      </div>
                      <div className="details">
                        <div>Path: {media.id}</div>
                        <div>Merged file: {media.name}.mp4</div>
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
        ) : (
          <div className="remux-panel">
            <h2>External Audio Remux</h2>
            <p>
              Remux external audio tracks into a single MKV file alongside the main video.
            </p>
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
                            onClick={() => toggleRemuxGroup(group.id)}
                          >
                            {isExpanded ? 'Hide' : 'Show'}
                          </button>
                          <span>{group.name}</span>
                        </div>
                        <button
                          type="button"
                          disabled={unavailable || isPending}
                          onClick={() => handleRemuxAll(group)}
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
                                    Audio tracks: {audioCount} • Output: {item.outputPath || 'N/A'}
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
        )}
      </div>
    </div>
  );
}

export default App;
