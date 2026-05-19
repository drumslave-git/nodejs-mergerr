'use strict';

const dotenv = require('dotenv');

dotenv.config();

function readInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function buildBaseUrl(host, port) {
  const withScheme = host.startsWith('http') ? host : `http://${host}`;
  try {
    const url = new URL(withScheme);
    if (port) url.port = String(port);
    return url.toString().replace(/\/$/, '');
  } catch {
    return `http://${host}:${port}`;
  }
}

const qbit = {
  host: process.env.QBIT_HOST || 'localhost',
  port: readInt('QBIT_PORT', 8080),
  user: process.env.QBIT_USER || '',
  password: process.env.QBIT_PASSWORD || '',
  requestTimeoutMs: readInt('QBIT_REQUEST_TIMEOUT_MS', 10_000, { min: 1000, max: 120_000 }),
  maxRetries: readInt('QBIT_MAX_RETRIES', 3, { min: 1, max: 10 }),
  retryBackoffMs: readInt('QBIT_RETRY_BACKOFF_MS', 500, { min: 0, max: 30_000 })
};

qbit.baseUrl = buildBaseUrl(qbit.host, qbit.port);

const server = {
  port: readInt('PORT', 3000, { min: 1, max: 65_535 })
};

module.exports = { qbit, server };
