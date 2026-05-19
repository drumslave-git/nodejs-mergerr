'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const distRoot = path.join(projectRoot, 'dist');
const publicRoot = path.join(projectRoot, 'public');
const staticRoot = fs.existsSync(distRoot) ? distRoot : publicRoot;
const usingDist = staticRoot === distRoot;

const CONTENT_TYPES = {
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

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath || '/');
  const normalized = decoded === '/' ? '/index.html' : decoded;
  const fullPath = path.resolve(staticRoot, `.${normalized}`);
  const relative = path.relative(staticRoot, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

async function sendFile(filePath, res) {
  try {
    const data = await fsp.readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}

async function serveStatic(urlPath, res) {
  const filePath = resolveStaticPath(urlPath);
  if (!filePath) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  try {
    const stats = await fsp.stat(filePath);
    if (stats.isFile()) {
      await sendFile(filePath, res);
      return;
    }
  } catch {
    // fall through to SPA fallback / 404 below
  }
  if (usingDist) {
    await sendFile(path.join(staticRoot, 'index.html'), res);
    return;
  }
  res.statusCode = 404;
  res.end('Not found');
}

module.exports = { serveStatic };
