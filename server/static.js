const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const staticRoot = fs.existsSync(distRoot) ? distRoot : path.join(projectRoot, 'public');
const usingDist = staticRoot === distRoot;

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

module.exports = { serveStatic };
