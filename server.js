const http = require('http');
const { requestHandler } = require('./server/httpHandler');

const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  requestHandler(req, res).catch((err) => {
    console.error('Request handling failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
