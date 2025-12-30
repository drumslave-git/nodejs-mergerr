import React, { useEffect, useRef, useState } from 'react';

function App() {
  const [movies, setMovies] = useState([]);
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

    source.addEventListener('moviesUpdate', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        setMovies(Array.isArray(payload) ? payload : []);
      } catch (err) {
        console.error('Failed to parse movies update', err);
      }
    });

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
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  async function handleMerge(movie) {
    setLogText('');
    setCurrentChannel(null);
    setPendingId(movie.id);
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: movie.id })
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
        setPendingId((current) => (current === movie.id ? null : current));
      }, 5000);
    }
  }

  return (
    <div className="container">
      <h1>Multi-part Movie Merger</h1>
      <p>
        The application monitors a target folder for multi-part movies. A multi-part movie is
        defined as a directory containing two or more video files. When you press{' '}
        <strong>Merge</strong>, the files will be concatenated in order of their file names using
        ffmpeg&apos;s concat demuxer.
      </p>
      <div id="movies">
        {movies.length === 0 ? (
          <p>No completed torrents detected.</p>
        ) : (
          movies.map((movie) => {
            const allFiles =
              movie.filesAll && movie.filesAll.length ? movie.filesAll : movie.files || [];
            const videoCount = (movie.files && movie.files.length) || 0;
            const unavailable = movie.available === false || movie.mergeable === false;
            const isPending = pendingId === movie.id;
            const buttonLabel = isPending ? 'Merging...' : unavailable ? 'Not mergeable' : 'Merge';

            return (
              <div className="movie" key={movie.id}>
                <div className="movie-header">
                  <span className="movie-title">{movie.name}</span>
                  <button
                    type="button"
                    disabled={unavailable || isPending}
                    onClick={() => handleMerge(movie)}
                  >
                    {buttonLabel}
                  </button>
                </div>
                <div className="details">
                  <div>Path: {movie.id}</div>
                  <div>Merged file: {movie.name}.mp4</div>
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
                  {movie.warning ? <div className="note">{movie.warning}</div> : null}
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
