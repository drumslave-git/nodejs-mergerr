'use strict';

const { scanner } = require('../../media/scanner');
const { startMerge } = require('../../media/merge');
const { log } = require('../../log');
const { sendJson, sendError, readJsonBody } = require('../responses');

const ERROR_MESSAGES = {
  qbitUnavailable: 'qBittorrent unavailable',
  badResponse: 'qBittorrent response invalid',
  unknownCategory: 'Unknown category'
};

const ERROR_STATUS = {
  qbitUnavailable: 502,
  badResponse: 502,
  unknownCategory: 404
};

async function list(req, res, url) {
  const categoryId = url.searchParams.get('category');
  if (!categoryId) return sendError(res, 400, 'Missing category');
  const { media, error } = await scanner.scanMerge(categoryId);
  if (error) {
    return sendError(res, ERROR_STATUS[error] || 502, ERROR_MESSAGES[error] || 'Scan failed');
  }
  sendJson(res, 200, Object.values(media));
}

async function start(req, res) {
  const body = await readJsonBody(req);
  const { id, category } = body;
  if (!id || !category) {
    log('warn', 'Merge requested without category or id', { id, category });
    return sendError(res, 400, 'Missing category or id');
  }
  const media = scanner.getMergeItem(category, id);
  if (!media) {
    log('warn', 'Merge requested with invalid media id', { id });
    return sendError(res, 400, 'Invalid media id');
  }
  if (!media.available || !media.mergeable) {
    log('warn', 'Merge requested for unavailable media', { id });
    return sendError(res, 400, 'Media not available for merge');
  }
  log('info', 'Starting merge job', { media: media.name, dir: id });
  const { jobId, channel } = startMerge(media, category);
  sendJson(res, 200, { status: 'started', jobId, channel });
}

module.exports = { list, start };
