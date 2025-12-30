const dotenv = require('dotenv');

dotenv.config();

const config = {
  qbitHost: process.env.QBIT_HOST || 'localhost',
  qbitPort: parseInt(process.env.QBIT_PORT || '8080', 10),
  qbitUser: process.env.QBIT_USER || '',
  qbitPassword: process.env.QBIT_PASSWORD || ''
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
