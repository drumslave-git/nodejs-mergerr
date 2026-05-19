'use strict';

const http = require('node:http');
const { handle } = require('./server/http/router');
const { server: serverConfig } = require('./server/config');
const { log } = require('./server/log');

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    log('error', 'Request handling failed', { message: err.message });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });
});

server.listen(serverConfig.port, () => {
  log('info', 'Server listening', { port: serverConfig.port });
});
