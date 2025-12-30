const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
dotenv.config();

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
 * This server monitors a target directory for multi‑part media and exposes a
 * minimal web UI.  It uses Server‑Sent Events (SSE) to push updates to the
 * client: whenever the directory contents change or a merge job produces
 * output, connected browsers receive events in real time.  This approach
 * avoids the need for third‑party packages such as Express or socket.io.
 */

// Configuration via environment variables. See README for descriptions.
const config = {
  qbitHost: process.env.QBIT_HOST || 'localhost',
  qbitPort: parseInt(process.env.QBIT_PORT || '8080', 10),
  qbitUser: process.env.QBIT_USER || '',
  qbitPassword: process.env.QBIT_PASSWORD || ''
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
// SID cookie for qBittorrent sessions. Populated after a successful login.
let qbitCookie = '';

log('info', 'qBittorrent settings', {
  baseUrl: qbitBaseUrl,
  hasAuth: Boolean(config.qbitUser)
});

/**
 * Perform a qBittorrent login using configured credentials and capture the
 * SID cookie. If the Web UI allows anonymous access this is a no-op.
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
 * Fetch JSON from qBittorrent. If authentication is enabled and the stored
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
 * Scan for directories. Merge is enabled only for entries with 2+ video files.
 */
function scanForDirectories(allowedDirectories, sourceLabel) {
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
    source: sourceLabel || 'category',
    directories: directoriesToScan.length,
    media: Object.keys(result).length
  });

  return result;
}

// In-memory list of detected multi-part media items.
const mediaByCategory = {};

async function fetchQbitCategories() {
  try {
    if (config.qbitUser && !qbitCookie) {
      await loginToQbit();
    }
    const categories = await qbitFetchJson('/api/v2/torrents/categories');
    if (!categories || typeof categories !== 'object') {
      log('warn', 'Unexpected qBittorrent response shape for categories');
      return null;
    }
    return categories;
  } catch (err) {
    log('error', 'qBittorrent categories fetch failed', { error: err.message || String(err) });
    return null;
  }
}

async function getCategories() {
  const categories = await fetchQbitCategories();
  if (!categories) return null;
  return Object.entries(categories).map(([name, details]) => ({
    id: name,
    name,
    path: details && details.savePath ? details.savePath : ''
  }));
}

/**
 * Determine the on-disk directory for a torrent entry. For single-file
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
  return path.resolve(normalized);
}

async function fetchCompletedTorrentDirectories(categoryId) {
  const categories = await fetchQbitCategories();
  if (!categories) {
    return { directories: null, error: 'qbitUnavailable' };
  }
  if (!categories[categoryId]) {
    return { directories: null, error: 'unknownCategory' };
  }
  try {
    if (config.qbitUser && !qbitCookie) {
      await loginToQbit();
    }
    const params = new URLSearchParams({
      category: categoryId,
      filter: 'completed'
    });
    const pathFragment = `/api/v2/torrents/info?${params.toString()}`;
    log('info', 'Fetching torrents from qBittorrent', { path: pathFragment });
    const torrents = await qbitFetchJson(pathFragment);
    if (!Array.isArray(torrents)) {
      log('warn', 'Unexpected qBittorrent response shape for torrents');
      return { directories: null, error: 'badResponse' };
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
    return { directories, error: null };
  } catch (err) {
    log('error', 'qBittorrent scan failed', { error: err.message || String(err) });
    return { directories: null, error: 'qbitUnavailable' };
  }
}

async function scanCategory(categoryId) {
  const { directories, error } = await fetchCompletedTorrentDirectories(categoryId);
  if (!directories) {
    return { media: null, error };
  }
  const scanned = scanForDirectories(directories, categoryId);
  mediaByCategory[categoryId] = scanned;
  return { media: scanned, error: null };
}

/**
 * List of SSE clients.  Each entry is an object with a `res` property
 * pointing to an HTTP response stream.  When an update occurs we
 * iterate through this list and write events to each response.  On
 * connection close the entry is removed.
 */
const clients = [];

const distRoot = path.join(__dirname, 'dist');
const staticRoot = fs.existsSync(distRoot) ? distRoot : path.join(__dirname, 'public');
const usingDist = staticRoot === distRoot;

/**
 * Broadcast a server‑sent event to all connected clients.  Pass an
 * event name and a data payload (string or object).  Objects will be
 * JSON‑encoded automatically.  Newlines in the data are escaped to
 * preserve SSE framing.
 *
 * @param {string} event Event name (e.g. 'mediaUpdate', 'log')
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
 * Merge a multi‑part media item using ffmpeg.  Creates a file list file and
 * runs ffmpeg with the concat demuxer.  Sends real‑time log events
 * tagged with the provided channel via SSE.  On completion, the
 * media list is refreshed to reflect the disappearance of parts and
 * appearance of the merged output.
 *
 * @param {Object} media Media definition
 * @param {string} jobId Directory path used as the job identifier
 * @param {string} channel Base64‑encoded channel identifier for SSE
 */
function mergeMedia(media, jobId, channel, categoryId) {
  const dirPath = media.id;
  const parentName = media.name;
  const fileListPath = path.join(dirPath, 'concat-list.txt');
  const outputFileName = `${parentName}.mp4`;
  const outputFilePath = path.join(dirPath, outputFileName);
  log('info', 'Preparing merge', {
    media: parentName,
    parts: media.files.length,
    output: outputFilePath
  });
  // Compose the file list
  const listContent = media.files
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
    if (categoryId) {
      scanCategory(categoryId).catch((err) => {
        console.error('Refresh failed after merge:', err);
      });
    }
  });
}

/**
 * Handle incoming HTTP requests.  Serves static files, API endpoints and
 * SSE connections.
 */
async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  // API: list categories
  if (method === 'GET' && url.pathname === '/api/categories') {
    const categories = await getCategories();
    if (!categories) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'qBittorrent unavailable' }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ categories }));
    return;
  }
  // API: list media for a category
  if (method === 'GET' && url.pathname === '/api/media') {
    const categoryId = url.searchParams.get('category');
    if (!categoryId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing category' }));
      return;
    }
    const { media, error } = await scanCategory(categoryId);
    if (error) {
      res.statusCode = error === 'qbitUnavailable' || error === 'badResponse' ? 502 : 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            error === 'qbitUnavailable'
              ? 'qBittorrent unavailable'
              : error === 'badResponse'
                ? 'qBittorrent response invalid'
                : 'Unknown category'
        })
      );
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(Object.values(media)));
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
        const categoryId = data.category;
        if (!categoryId || !id) {
          log('warn', 'Merge requested without category or id', { id, category: categoryId });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing category or id' }));
          return;
        }
        const categoryMedia = mediaByCategory[categoryId];
        if (!categoryMedia || !categoryMedia[id]) {
          log('warn', 'Merge requested with invalid media id', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid media id' }));
          return;
        }
        const media = categoryMedia[id];
        const jobId = id;
        const channel = Buffer.from(jobId).toString('base64');
        if (!media.available || !media.mergeable) {
          log('warn', 'Merge requested for unavailable media', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Media not available for merge' }));
          return;
        }
        log('info', 'Starting merge job', { media: media.name, dir: jobId });
        mergeMedia(media, jobId, channel, categoryId);
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
  if (method === 'GET') {
    return serveStatic(url.pathname, res);
  }
  // 404 fallback
  res.statusCode = 404;
  res.end('Not found');
}

/**
 * Resolve a safe file path under the static root for the given URL path.
 */
function resolveStaticPath(urlPath) {
  const safePath = decodeURIComponent(urlPath || '/');
  const normalizedPath = safePath === '/' ? '/index.html' : safePath;
  const fullPath = path.resolve(staticRoot, `.${normalizedPath}`);
  const relative = path.relative(staticRoot, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return fullPath;
}

function getContentType(filePath) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.map': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  return contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serveStatic(urlPath, res) {
  const filePath = resolveStaticPath(urlPath);
  if (!filePath) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (usingDist) {
        const indexPath = path.join(staticRoot, 'index.html');
        return serveFile(indexPath, res);
      }
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    return serveFile(filePath, res);
  });
}

/**
 * Serve a file from the static directory. Reads the file asynchronously
 * and sends it with the appropriate content type. On error, returns 500.
 */
function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.end('Internal Server Error');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.end(data);
  });
}

// Create and start the HTTP server.
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((err) => {
    console.error('Request handling failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
});
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

