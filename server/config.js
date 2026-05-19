const dotenv = require('dotenv');

dotenv.config();

function intFromEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const config = {
  qbitHost: process.env.QBIT_HOST || 'localhost',
  qbitPort: parseInt(process.env.QBIT_PORT || '8080', 10),
  qbitUser: process.env.QBIT_USER || '',
  qbitPassword: process.env.QBIT_PASSWORD || '',
  qbitRequestTimeoutMs: intFromEnv('QBIT_REQUEST_TIMEOUT_MS', 10000, { min: 1000, max: 120000 }),
  qbitMaxRetries: intFromEnv('QBIT_MAX_RETRIES', 3, { min: 1, max: 10 }),
  qbitRetryBackoffMs: intFromEnv('QBIT_RETRY_BACKOFF_MS', 500, { min: 0, max: 30000 })
};

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

module.exports = { config, qbitBaseUrl };
