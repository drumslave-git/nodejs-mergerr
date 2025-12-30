const { log } = require('./log');

const clients = [];

function broadcastEvent(event, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const escaped = payload.replace(/\n/g, '\n');
  clients.forEach(({ res }) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${escaped}\n\n`);
  });
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('\n');
  const client = { res };
  clients.push(client);
  log('info', 'SSE client connected', { clients: clients.length });
  req.on('close', () => {
    const idx = clients.indexOf(client);
    if (idx >= 0) clients.splice(idx, 1);
    log('info', 'SSE client disconnected', { clients: clients.length });
  });
}

module.exports = { broadcastEvent, handleSse };
