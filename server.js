const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const output = `[${ts}] [${level.toUpperCase()}] ${message}${suffix}`;
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/*
 * Simple Node.js web server without external dependencies.
 *
 * This server monitors a target directory for multi‑part movies and exposes a
 * minimal web UI.  It uses Server‑Sent Events (SSE) to push updates to the
 * client: whenever the directory contents change or a merge job produces
 * output, connected browsers receive events in real time.  This approach
 * avoids the need for third‑party packages such as Express or socket.io.
 */

// Configuration via environment variables.  See README for descriptions.
const config = {
  qbitHost: process.env.QBIT_HOST || 'localhost',
  qbitPort: parseInt(process.env.QBIT_PORT || '8080', 10),
  qbitUser: process.env.QBIT_USER || '',
  qbitPassword: process.env.QBIT_PASSWORD || '',
  qbitCategory: process.env.QBIT_CATEGORY || ''
};

// Build the base URL for qBittorrent's Web API.
const qbitBaseUrl = (() => {
  const host = config.qbitHost.startsWith('http') ? config.qbitHost : `http://${config.qbitHost}`;
  try {
    const url = new URL(host);
    if (config.qbitPort) {
      url.port = String(config.qbitPort);
    }
    return url.toString().replace(/\/$/, '');
  } catch (err) {
    return `http://${config.qbitHost}:${config.qbitPort}`;
  }
})();
// SID cookie for qBittorrent sessions.  Populated after a successful login.
let qbitCookie = '';
let loggedMissingCategory = false;

log('info', 'qBittorrent settings', {
  baseUrl: qbitBaseUrl,
  category: config.qbitCategory || '(none)',
  hasAuth: Boolean(config.qbitUser)
});

/**
 * Perform a qBittorrent login using configured credentials and capture the
 * SID cookie.  If the Web UI allows anonymous access this is a no-op.
 */
async function loginToQbit() {
  if (!config.qbitUser) {
    return;
  }
  log('info', 'Attempting qBittorrent login');
  const params = new URLSearchParams();
  params.set('username', config.qbitUser);
  params.set('password', config.qbitPassword);
  const res = await fetch(`${qbitBaseUrl}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    redirect: 'manual'
  });
  if (!res.ok) {
    throw new Error(`qBittorrent login failed with status ${res.status}`);
  }
  const cookieHeader = res.headers.get('set-cookie');
  if (!cookieHeader) {
    throw new Error('qBittorrent login did not return a session cookie');
  }
  qbitCookie = cookieHeader.split(';')[0];
  log('info', 'qBittorrent login succeeded');
}

/**
 * Fetch JSON from qBittorrent.  If authentication is enabled and the stored
 * cookie is missing or rejected, it will attempt a single re-login.
 */
async function qbitFetchJson(pathname, allowRetry = true) {
  const headers = {};
  if (qbitCookie) {
    headers.Cookie = qbitCookie;
  }
  const res = await fetch(`${qbitBaseUrl}${pathname}`, { headers });
  if (res.status === 403 && allowRetry && config.qbitUser) {
    log('warn', 'qBittorrent session rejected, re-authenticating', { pathname });
    qbitCookie = '';
    await loginToQbit();
    return qbitFetchJson(pathname, false);
  }
  if (!res.ok) {
    log('error', 'qBittorrent request failed', { pathname, status: res.status });
    throw new Error(`qBittorrent request failed with status ${res.status}`);
  }
  return res.json();
}

/**
 * Determine the on-disk directory for a torrent entry.  For single-file
 * torrents, use the parent directory; for multi-file torrents use
 * content_path directly.
 */
function deriveTorrentDirectory(torrent) {
  const candidate =
    torrent.content_path ||
    (torrent.save_path && torrent.name ? path.join(torrent.save_path, torrent.name) : '');
  if (!candidate) {
    return null;
  }
  const normalized = path.normalize(candidate);
  const dirPath = path.extname(normalized) ? path.dirname(normalized) : normalized;
  return path.resolve(dirPath);
}

/**
 * Query qBittorrent for completed torrents in the configured category and
 * return an array describing their directories. Entries whose payload paths
 * are not present locally are still returned so the UI can show a note.
 */
async function fetchCompletedTorrentDirectories() {
  if (!config.qbitCategory) {
    if (!loggedMissingCategory) {
      log('warn', 'QBIT_CATEGORY not set; qBittorrent scan skipped');
      loggedMissingCategory = true;
    }
    return null;
  }
  try {
    if (config.qbitUser && !qbitCookie) {
      await loginToQbit();
    }
    const params = new URLSearchParams({
      category: config.qbitCategory,
      filter: 'completed'
    });
    const pathFragment = `/api/v2/torrents/info?${params.toString()}`;
    log('info', 'Fetching torrents from qBittorrent', { path: pathFragment });
    const torrents = await qbitFetchJson(pathFragment);
    if (!Array.isArray(torrents)) {
      log('warn', 'Unexpected qBittorrent response shape for torrents');
      return null;
    }
    const directories = [];
    torrents.forEach((torrent) => {
      const dirPath = deriveTorrentDirectory(torrent);
      if (!dirPath) return;
      let exists = false;
      let statError = null;
      try {
        const stats = fs.statSync(dirPath);
        exists = stats.isDirectory();
      } catch (err) {
        statError = err;
      }
      if (!exists && statError) {
        log('warn', 'Torrent path missing locally', {
          path: dirPath,
          error: statError.code || statError.message
        });
      }
      directories.push({
        dirPath,
        name: torrent.name || path.basename(dirPath),
        exists
      });
    });
    log('info', 'qBittorrent completed torrent directories collected', {
      torrents: torrents.length,
      directories: directories.length
    });
    return directories;
  } catch (err) {
    log('error', 'qBittorrent scan failed', { error: err.message || String(err) });
    return null;
  }
}

/**
 * Determine whether a file is a video based on its extension.
 */
function isVideoFile(fileName) {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.m4v'];
  return videoExtensions.includes(path.extname(fileName).toLowerCase());
}

/**
 * Build a torrent entry description. Always returns an object so UI can
 * show single-file torrents and missing paths.
 */
function buildTorrentEntry(dirPath, nameOverride, exists = true) {
  const name = nameOverride || path.basename(dirPath);
  if (!exists) {
    return {
      id: dirPath,
      name,
      files: [],
      filesAll: [],
      warning: 'Directory not found on server',
      available: false,
      mergeable: false
    };
  }
  let allFiles = [];
  let videoFiles = [];
  try {
    const stats = fs.statSync(dirPath);
    if (stats.isDirectory()) {
      allFiles = fs
        .readdirSync(dirPath)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      videoFiles = allFiles.filter((f) => isVideoFile(f));
    }
  } catch (err) {
    return {
      id: dirPath,
      name,
      files: [],
      filesAll: [],
      warning: 'Directory not accessible',
      available: false,
      mergeable: false
    };
  }

  const mergeable = videoFiles.length >= 2;
  let warning = '';
  if (videoFiles.length === 0) {
    warning = 'No video files found';
  } else if (videoFiles.length === 1) {
    warning = 'Single-file torrent; merge not needed';
  }

  return {
    id: dirPath,
    name,
    files: videoFiles.map((f) => path.join(dirPath, f)),
    filesAll: allFiles.map((f) => path.join(dirPath, f)),
    available: true,
    mergeable,
    warning: warning || undefined
  };
}

/**
 * Scan for torrents from qBittorrent.  All completed torrents in the
 * category are shown; merge is enabled only for entries with 2+ video files.
 */
function scanForTorrents(allowedDirectories) {
  const result = {};
  const usingProvidedDirectories = Array.isArray(allowedDirectories);
  const directoriesToScan = usingProvidedDirectories ? allowedDirectories : [];

  directoriesToScan.forEach((entry) => {
    const dirPath = entry.dirPath || entry;
    const displayName = entry.name || path.basename(dirPath);
    const exists = entry.exists !== false;
    const torrentEntry = buildTorrentEntry(dirPath, displayName, exists);
    result[torrentEntry.id] = torrentEntry;
  });

  log('info', 'Scan completed', {
    source: 'qbitCategory',
    directories: directoriesToScan.length,
    movies: Object.keys(result).length
  });

  return result;
}

// In‑memory list of detected multi‑part movies.
let multiPartMovies = {};

/**
 * List of SSE clients.  Each entry is an object with a `res` property
 * pointing to an HTTP response stream.  When an update occurs we
 * iterate through this list and write events to each response.  On
 * connection close the entry is removed.
 */
const clients = [];

/**
 * Broadcast a server‑sent event to all connected clients.  Pass an
 * event name and a data payload (string or object).  Objects will be
 * JSON‑encoded automatically.  Newlines in the data are escaped to
 * preserve SSE framing.
 *
 * @param {string} event Event name (e.g. 'moviesUpdate', 'log')
 * @param {string|Object} data Data payload
 */
function broadcastEvent(event, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const escaped = payload.replace(/\n/g, '\n');
  clients.forEach(({ res }) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${escaped}\n\n`);
  });
}

/**
 * Refresh the list of multi‑part movies.  If the list has changed
 * since the last scan, broadcast a 'moviesUpdate' event.  This
 * function is called periodically.
 */
async function refreshMovies() {
  const directoriesFromQbit = await fetchCompletedTorrentDirectories();
  const newList = scanForTorrents(directoriesFromQbit);
  const currentKeys = Object.keys(multiPartMovies);
  const newKeys = Object.keys(newList);
  // Check if the sets of keys differ, or if any movie's file list changed.
  const changed =
    currentKeys.length !== newKeys.length ||
    currentKeys.some((key) => {
      if (!newList[key]) return true;
      const oldFiles = multiPartMovies[key].files;
      const newFiles = newList[key].files;
      if (oldFiles.length !== newFiles.length) return true;
      for (let i = 0; i < oldFiles.length; i++) {
        if (oldFiles[i] !== newFiles[i]) return true;
      }
      return false;
    });
  if (changed) {
    multiPartMovies = newList;
    log('info', 'Movies list changed', {
      previousCount: currentKeys.length,
      currentCount: newKeys.length
    });
    broadcastEvent('moviesUpdate', Object.values(multiPartMovies));
  }
}

// Periodically rescan qBittorrent results every 10 seconds.
refreshMovies().catch((err) => {
  console.error('Initial refresh failed:', err);
});
setInterval(() => {
  refreshMovies().catch((err) => {
    console.error('Periodic refresh failed:', err);
  });
}, 10000);

/**
 * Merge a multi‑part movie using ffmpeg.  Creates a file list file and
 * runs ffmpeg with the concat demuxer.  Sends real‑time log events
 * tagged with the provided channel via SSE.  On completion, the
 * movies list is refreshed to reflect the disappearance of parts and
 * appearance of the merged output.
 *
 * @param {Object} movie Movie definition
 * @param {string} jobId Directory path used as the job identifier
 * @param {string} channel Base64‑encoded channel identifier for SSE
 */
function mergeMovie(movie, jobId, channel) {
  const dirPath = movie.id;
  const parentName = movie.name;
  const fileListPath = path.join(dirPath, 'concat-list.txt');
  const outputFileName = `${parentName}.mp4`;
  const outputFilePath = path.join(dirPath, outputFileName);
  log('info', 'Preparing merge', {
    movie: parentName,
    parts: movie.files.length,
    output: outputFilePath
  });
  // Compose the file list
  const listContent = movie.files
    .map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(fileListPath, listContent, 'utf8');
  // ffmpeg command; see ffmpeg concat demuxer documentation【752097775662452†L90-L116】
  const ffmpegArgs = [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    fileListPath,
    '-c',
    'copy',
    outputFilePath
  ];
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  log('info', 'ffmpeg started', { args: ffmpegArgs });
  // Helper to send log messages to the appropriate channel.
  function sendLog(message) {
    broadcastEvent('log', { channel, message });
  }
  ffmpeg.stdout.on('data', (data) => {
    sendLog(data.toString());
  });
  ffmpeg.stderr.on('data', (data) => {
    sendLog(data.toString());
  });
  ffmpeg.on('close', (code) => {
    const message = code === 0 ? 'Merge completed' : `ffmpeg exited with code ${code}`;
    sendLog(`\n${message}\n`);
    log(code === 0 ? 'info' : 'error', 'ffmpeg process finished', { code });
    fs.unlink(fileListPath, (err) => {
      if (err) {
        console.error('Failed to remove list file:', err);
      }
    });
    // Remove original parts?  Leave them in place; user may want to delete.
    // Rescan directory to update list.
    refreshMovies().catch((err) => {
      console.error('Refresh failed after merge:', err);
    });
  });
}

/**
 * Handle incoming HTTP requests.  Serves static files, API endpoints and
 * SSE connections.
 */
function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  if (url.pathname === '/') {
    return serveFile('index.html', 'text/html', res);
  }
  if (method === 'GET' && url.pathname === '/style.css') {
    return serveFile('style.css', 'text/css', res);
  }
  if (method === 'GET' && url.pathname === '/script.js') {
    return serveFile('script.js', 'application/javascript', res);
  }
  // API: list movies
  if (method === 'GET' && url.pathname === '/api/movies') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(Object.values(multiPartMovies)));
    return;
  }
  // SSE endpoint
  if (method === 'GET' && url.pathname === '/events') {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');
    const client = { res };
    clients.push(client);
    log('info', 'SSE client connected', { clients: clients.length });
    // Send current movies immediately upon connection
    res.write(`event: moviesUpdate\n`);
    res.write(`data: ${JSON.stringify(Object.values(multiPartMovies))}\n\n`);
    req.on('close', () => {
      const idx = clients.indexOf(client);
      if (idx >= 0) clients.splice(idx, 1);
      log('info', 'SSE client disconnected', { clients: clients.length });
    });
    return;
  }
  // API: initiate merge
  if (method === 'POST' && url.pathname === '/api/merge') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const id = data.id;
        if (!id || !multiPartMovies[id]) {
          log('warn', 'Merge requested with invalid movie id', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid movie id' }));
          return;
        }
        const movie = multiPartMovies[id];
        const jobId = id;
        const channel = Buffer.from(jobId).toString('base64');
        if (!movie.available || !movie.mergeable) {
          log('warn', 'Merge requested for unavailable movie', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Movie not available for merge' }));
          return;
        }
        log('info', 'Starting merge job', { movie: movie.name, dir: jobId });
        mergeMovie(movie, jobId, channel);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'started', jobId, channel }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  // 404 fallback
  res.statusCode = 404;
  res.end('Not found');
}

/**
 * Serve a file from the public directory.  Reads the file asynchronously
 * and sends it with the appropriate content type.  On error, returns
 * 500.
 */
function serveFile(fileName, contentType, res) {
  const filePath = path.join(__dirname, 'public', fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.end('Internal Server Error');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

// Create and start the HTTP server.
const port = process.env.PORT || 3000;
const server = http.createServer(requestHandler);
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
