const { config, qbitBaseUrl } = require('./config');
const { log } = require('./log');

let qbitCookie = '';

log('info', 'qBittorrent settings', {
  baseUrl: qbitBaseUrl,
  hasAuth: Boolean(config.qbitUser)
});

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

async function fetchCompletedTorrentsWithFiles(categoryId) {
  const categories = await fetchQbitCategories();
  if (!categories) {
    return { torrents: null, error: 'qbitUnavailable' };
  }
  if (!categories[categoryId]) {
    return { torrents: null, error: 'unknownCategory' };
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
      return { torrents: null, error: 'badResponse' };
    }
    const enriched = [];
    for (const torrent of torrents) {
      if (!torrent || !torrent.hash) continue;
      let files = [];
      try {
        files = await qbitFetchJson(`/api/v2/torrents/files?hash=${torrent.hash}`);
      } catch (err) {
        log('warn', 'qBittorrent file list fetch failed', {
          hash: torrent.hash,
          error: err.message || String(err)
        });
      }
      enriched.push({ torrent, files: Array.isArray(files) ? files : [] });
    }
    log('info', 'qBittorrent completed torrent files collected', {
      torrents: torrents.length,
      entries: enriched.length
    });
    return { torrents: enriched, error: null };
  } catch (err) {
    log('error', 'qBittorrent scan failed', { error: err.message || String(err) });
    return { torrents: null, error: 'qbitUnavailable' };
  }
}

module.exports = { getCategories, fetchCompletedTorrentsWithFiles };
