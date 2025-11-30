/*
 * Front‑end logic for the multi‑part movie merger.  This script uses
 * the Fetch API to initiate merges and Server‑Sent Events (SSE) to
 * receive updates from the server.  When a merge is in progress, logs
 * are streamed to the page and displayed in a preformatted area.
 */
(function () {
  const moviesContainer = document.getElementById('movies');
  const logContainer = document.getElementById('log');
  let currentChannel = null;
  let eventSource = null;

  /**
   * Initialise the SSE connection.  If there is an existing EventSource
   * it will be closed before creating a new one.  Registers handlers
   * for moviesUpdate and log events.  The log handler checks
   * the `channel` field to route messages to the correct merge job.
   */
  function initEvents() {
    if (eventSource) {
      eventSource.close();
    }
    eventSource = new EventSource('/events');
    eventSource.addEventListener('moviesUpdate', (evt) => {
      try {
        const movies = JSON.parse(evt.data);
        renderMovies(movies);
      } catch (err) {
        console.error('Failed to parse movies update', err);
      }
    });
    eventSource.addEventListener('log', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.channel && payload.message) {
          if (currentChannel && payload.channel === currentChannel) {
            logContainer.textContent += payload.message;
            logContainer.scrollTop = logContainer.scrollHeight;
          }
        }
      } catch (err) {
        console.error('Failed to parse log event', err);
      }
    });
    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
    };
  }

  /**
   * Render the list of movies.  Each movie displays its name and a
   * merge button.  Pressing the button initiates a merge via the
   * /api/merge endpoint and updates the current channel so that log
   * messages are routed correctly.
   */
  function renderMovies(movies) {
    moviesContainer.innerHTML = '';
    if (!movies || movies.length === 0) {
      moviesContainer.innerHTML = '<p>No completed torrents detected.</p>';
      return;
    }
    movies.forEach((movie) => {
      const div = document.createElement('div');
      div.className = 'movie';
      const title = document.createElement('span');
      title.textContent = movie.name;
      const button = document.createElement('button');
      button.textContent = 'Merge';
      const unavailable = movie.available === false || movie.mergeable === false;
      if (unavailable) {
        button.disabled = true;
        button.textContent = 'Not mergeable';
      }
      button.onclick = async () => {
        logContainer.textContent = '';
        currentChannel = null;
        button.disabled = true;
        button.textContent = 'Merging...';
        try {
          const res = await fetch('/api/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: movie.id })
          });
          const data = await res.json();
          if (data.channel) {
            currentChannel = data.channel;
          }
        } catch (err) {
          console.error('Failed to start merge', err);
        } finally {
          // Re-enable the button after a short delay.  It will be removed
          // automatically when the directory rescan runs and the movie
          // disappears from the list.
          setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Merge';
          }, 5000);
        }
      };
      const info = document.createElement('div');
      info.className = 'details';
      const pathLine = document.createElement('div');
      pathLine.textContent = `Path: ${movie.id}`;
      const outputLine = document.createElement('div');
      outputLine.textContent = `Merged file: ${movie.name}.mp4`;
      const filesHeader = document.createElement('div');
      filesHeader.textContent = `Files (${(movie.files && movie.files.length) || 0}):`;
      const fileList = document.createElement('ul');
      fileList.className = 'file-list';
      if (movie.files && movie.files.length) {
        movie.files.forEach((filePath) => {
          const li = document.createElement('li');
          li.textContent = filePath;
          fileList.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = 'No parts found.';
        fileList.appendChild(li);
      }
      div.appendChild(title);
      div.appendChild(button);
      info.appendChild(pathLine);
      info.appendChild(outputLine);
      info.appendChild(filesHeader);
      info.appendChild(fileList);
      if (movie.warning) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = movie.warning;
        info.appendChild(note);
      }
      div.appendChild(info);
      moviesContainer.appendChild(div);
    });
  }

  // Initialise event listeners on page load
  initEvents();
})();
