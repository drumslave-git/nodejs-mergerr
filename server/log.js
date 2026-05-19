'use strict';

const LEVELS = {
  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: console.log
};

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] [${level.toUpperCase()}] ${message}${suffix}`;
  (LEVELS[level] || console.log)(line);
}

module.exports = { log };
