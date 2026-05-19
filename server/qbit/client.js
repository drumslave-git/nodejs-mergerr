'use strict';

const { qbit } = require('../config');
const { log } = require('../log');

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT'
]);

function describeFetchError(err) {
  if (!err) return { message: 'Unknown error' };
  const out = { message: err.message || String(err) };
  if (err.name && err.name !== 'Error') out.name = err.name;
  if (err.code) out.code = err.code;
  const cause = err.cause;
  if (cause && typeof cause === 'object') {
    if (cause.code) out.causeCode = cause.code;
    if (cause.errno) out.causeErrno = cause.errno;
    if (cause.hostname) out.causeHostname = cause.hostname;
    if (cause.message && cause.message !== err.message) out.causeMessage = cause.message;
  }
  return out;
}

function isRetryable(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;
  const causeCode = err.cause && err.cause.code;
  if (causeCode && RETRYABLE_CODES.has(causeCode)) return true;
  // Generic undici failure with a cause we couldn't classify above.
  if (err.message === 'fetch failed' && err.cause) return true;
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class QbitClient {
  constructor() {
    this.cookie = '';
    this.loginPromise = null;
    log('info', 'qBittorrent settings', {
      baseUrl: qbit.baseUrl,
      hasAuth: Boolean(qbit.user),
      requestTimeoutMs: qbit.requestTimeoutMs,
      maxRetries: qbit.maxRetries
    });
  }

  async rawFetch(pathname, init = {}) {
    const url = `${qbit.baseUrl}${pathname}`;
    let lastError;
    for (let attempt = 1; attempt <= qbit.maxRetries; attempt++) {
      const signal = AbortSignal.timeout(qbit.requestTimeoutMs);
      try {
        return await fetch(url, { ...init, signal });
      } catch (err) {
        lastError = err;
        const hasMore = attempt < qbit.maxRetries;
        if (!isRetryable(err) || !hasMore) throw err;
        const delay = qbit.retryBackoffMs * 2 ** (attempt - 1);
        log('warn', 'qBittorrent request errored, retrying', {
          pathname,
          attempt,
          nextAttemptInMs: delay,
          ...describeFetchError(err)
        });
        await sleep(delay);
      }
    }
    throw lastError;
  }

  async login() {
    if (!qbit.user) return;
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this.#performLogin()
      .catch((err) => {
        this.cookie = '';
        throw err;
      })
      .finally(() => {
        this.loginPromise = null;
      });
    return this.loginPromise;
  }

  async #performLogin() {
    log('info', 'Attempting qBittorrent login');
    const params = new URLSearchParams();
    params.set('username', qbit.user);
    params.set('password', qbit.password);
    const res = await this.rawFetch('/api/v2/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: qbit.baseUrl
      },
      body: params.toString(),
      redirect: 'manual'
    });
    if (!res.ok) {
      throw new Error(`qBittorrent login failed with status ${res.status}`);
    }
    const body = (await res.text()).trim();
    if (body && body.toLowerCase() !== 'ok.') {
      throw new Error(`qBittorrent login rejected: ${body.slice(0, 100)}`);
    }
    const cookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (() => {
            const raw = res.headers.get('set-cookie');
            return raw ? [raw] : [];
          })();
    const sid = cookies.find((c) => /^SID=/i.test(c));
    const chosen = sid || cookies[0];
    if (!chosen) {
      throw new Error('qBittorrent login did not return a session cookie');
    }
    this.cookie = chosen.split(';')[0];
    log('info', 'qBittorrent login succeeded');
  }

  async fetchJson(pathname, { allowAuthRetry = true } = {}) {
    if (qbit.user && !this.cookie) {
      await this.login();
    }
    const headers = this.cookie ? { Cookie: this.cookie } : {};
    const res = await this.rawFetch(pathname, { headers });
    if ((res.status === 401 || res.status === 403) && allowAuthRetry && qbit.user) {
      log('warn', 'qBittorrent session rejected, re-authenticating', {
        pathname,
        status: res.status
      });
      this.cookie = '';
      await this.login();
      return this.fetchJson(pathname, { allowAuthRetry: false });
    }
    if (!res.ok) {
      log('error', 'qBittorrent request failed', { pathname, status: res.status });
      throw new Error(`qBittorrent request failed with status ${res.status}`);
    }
    return res.json();
  }

  async fetchCategoriesRaw() {
    try {
      const categories = await this.fetchJson('/api/v2/torrents/categories');
      if (!categories || typeof categories !== 'object') {
        log('warn', 'Unexpected qBittorrent response shape for categories');
        return null;
      }
      return categories;
    } catch (err) {
      log('error', 'qBittorrent categories fetch failed', describeFetchError(err));
      return null;
    }
  }

  async listCategories() {
    const categories = await this.fetchCategoriesRaw();
    if (!categories) return null;
    return Object.entries(categories).map(([name, details]) => ({
      id: name,
      name,
      path: details && details.savePath ? details.savePath : ''
    }));
  }

  async listCompletedTorrents(categoryId) {
    const categories = await this.fetchCategoriesRaw();
    if (!categories) return { torrents: null, error: 'qbitUnavailable' };
    if (!categories[categoryId]) return { torrents: null, error: 'unknownCategory' };

    try {
      const params = new URLSearchParams({ category: categoryId, filter: 'completed' });
      const pathFragment = `/api/v2/torrents/info?${params.toString()}`;
      log('info', 'Fetching torrents from qBittorrent', { path: pathFragment });
      const torrents = await this.fetchJson(pathFragment);
      if (!Array.isArray(torrents)) {
        log('warn', 'Unexpected qBittorrent response shape for torrents');
        return { torrents: null, error: 'badResponse' };
      }
      const enriched = await Promise.all(
        torrents
          .filter((t) => t && t.hash)
          .map(async (torrent) => {
            try {
              const files = await this.fetchJson(`/api/v2/torrents/files?hash=${torrent.hash}`);
              return { torrent, files: Array.isArray(files) ? files : [] };
            } catch (err) {
              log('warn', 'qBittorrent file list fetch failed', {
                hash: torrent.hash,
                ...describeFetchError(err)
              });
              return { torrent, files: [] };
            }
          })
      );
      log('info', 'qBittorrent completed torrent files collected', {
        torrents: torrents.length,
        entries: enriched.length
      });
      return { torrents: enriched, error: null };
    } catch (err) {
      log('error', 'qBittorrent scan failed', describeFetchError(err));
      return { torrents: null, error: 'qbitUnavailable' };
    }
  }
}

const qbitClient = new QbitClient();

module.exports = { qbitClient };
