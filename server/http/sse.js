'use strict';

const { log } = require('../log');

const clients = new Set();

/**
 * Broadcasts an SSE event to all connected clients. `data` can be a string
 * or any JSON-serializable value. Multi-line strings are encoded as one
 * `data:` field per line, per the SSE spec.
 */
function broadcast(event, data) {
  if (clients.size === 0) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  let frame = `event: ${event}\n`;
  for (const line of payload.split('\n')) {
    frame += `data: ${line}\n`;
  }
  frame += '\n';
  for (const res of clients) {
    res.write(frame);
  }
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(':ok\n\n');
  clients.add(res);
  log('info', 'SSE client connected', { clients: clients.size });
  req.on('close', () => {
    clients.delete(res);
    log('info', 'SSE client disconnected', { clients: clients.size });
  });
}

module.exports = { broadcast, handleSse };
