'use strict';

const { sendError, HttpError } = require('./responses');
const { handleSse } = require('./sse');
const { serveStatic } = require('./static');
const { log } = require('../log');
const categories = require('./routes/categories');
const media = require('./routes/media');
const remux = require('./routes/remux');

const routes = [
  { method: 'GET', path: '/api/categories', handler: categories.list },
  { method: 'GET', path: '/api/media', handler: media.list },
  { method: 'POST', path: '/api/merge', handler: media.start },
  { method: 'GET', path: '/api/remux', handler: remux.list },
  { method: 'POST', path: '/api/remux', handler: remux.start },
  { method: 'GET', path: '/events', handler: (req, res) => handleSse(req, res) }
];

function findRoute(method, pathname) {
  return routes.find((route) => route.method === method && route.path === pathname);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = findRoute(req.method, url.pathname);

  if (route) {
    try {
      await route.handler(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, err.statusCode, err.message);
        return;
      }
      log('error', 'Route handler failed', {
        method: req.method,
        path: url.pathname,
        message: err.message
      });
      if (!res.headersSent) {
        sendError(res, 500, 'Internal Server Error');
      }
    }
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(url.pathname, res);
    return;
  }
  sendError(res, 404, 'Not found');
}

module.exports = { handle };
