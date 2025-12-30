import React, { useEffect, useRef, useState } from 'react';

function App() {
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('');
  const [categoryPath, setCategoryPath] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaMessage, setMediaMessage] = useState('Loading categories...');
  const [logText, setLogText] = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [pendingId, setPendingId] = useState(null);
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
    } catch (err) {
      console.error('Failed to load categories', err);
      setMediaItems([]);
      setMediaMessage('Failed to load categories.');
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

  async function handleMerge(media) {
    setLogText('');
    setCurrentChannel(null);
    setPendingId(media.id);
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
        setPendingId((current) => (current === media.id ? null : current));
      }, 5000);
    }
  }

  return (
    <div className="container">
      <h1>Multi-part Media Merger</h1>
      <p>
        Select a category to scan for multi-part media. A multi-part media item is defined as a
        directory containing two or more video files. When you press{' '}
        <strong>Merge</strong>, the files will be concatenated in order of their file names using
        ffmpeg&apos;s concat demuxer.
      </p>
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
          }}
          disabled={categories.length === 0}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => fetchMedia(currentCategory)}>
          Refresh
        </button>
        {categoryPath ? <span className="muted">Path: {categoryPath}</span> : null}
      </div>
      <div id="media">
        {mediaItems.length === 0 ? (
          <p>{mediaMessage}</p>
        ) : (
          mediaItems.map((media) => {
            const allFiles =
              media.filesAll && media.filesAll.length ? media.filesAll : media.files || [];
            const videoCount = (media.files && media.files.length) || 0;
            const unavailable = media.available === false || media.mergeable === false;
            const isPending = pendingId === media.id;
            const buttonLabel = isPending ? 'Merging...' : unavailable ? 'Not mergeable' : 'Merge';

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
    </div>
  );
}

export default App;
