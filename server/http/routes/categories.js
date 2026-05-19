'use strict';

const { qbitClient } = require('../../qbit/client');
const { sendJson, sendError } = require('../responses');

async function list(req, res) {
  const categories = await qbitClient.listCategories();
  if (!categories) return sendError(res, 502, 'qBittorrent unavailable');
  sendJson(res, 200, { categories });
}

module.exports = { list };
