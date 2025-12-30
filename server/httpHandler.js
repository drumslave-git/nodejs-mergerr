const { getCategories } = require('./qbitClient');
const { scanCategory, scanRemuxCategory, mediaByCategory, remuxByCategory } = require('./scan');
const { handleSse, broadcastEvent } = require('./sse');
const { mergeMedia } = require('./merge');
const { remuxMedia, remuxGroup } = require('./remux');
const { serveStatic } = require('./static');
const { log } = require('./log');

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  if (method === 'GET' && url.pathname === '/api/categories') {
    const categories = await getCategories();
    if (!categories) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'qBittorrent unavailable' }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ categories }));
    return;
  }
  if (method === 'GET' && url.pathname === '/api/media') {
    const categoryId = url.searchParams.get('category');
    if (!categoryId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing category' }));
      return;
    }
    const { media, error } = await scanCategory(categoryId);
    if (error) {
      res.statusCode = error === 'qbitUnavailable' || error === 'badResponse' ? 502 : 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            error === 'qbitUnavailable'
              ? 'qBittorrent unavailable'
              : error === 'badResponse'
                ? 'qBittorrent response invalid'
                : 'Unknown category'
        })
      );
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(Object.values(media)));
    return;
  }
  if (method === 'GET' && url.pathname === '/api/remux') {
    const categoryId = url.searchParams.get('category');
    if (!categoryId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing category' }));
      return;
    }
    const { media, error } = await scanRemuxCategory(categoryId);
    if (error) {
      res.statusCode = error === 'qbitUnavailable' || error === 'badResponse' ? 502 : 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            error === 'qbitUnavailable'
              ? 'qBittorrent unavailable'
              : error === 'badResponse'
                ? 'qBittorrent response invalid'
                : 'Unknown category'
        })
      );
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(Object.values(media)));
    return;
  }
  if (method === 'GET' && url.pathname === '/events') {
    handleSse(req, res);
    return;
  }
  if (method === 'POST' && url.pathname === '/api/merge') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const id = data.id;
        const categoryId = data.category;
        if (!categoryId || !id) {
          log('warn', 'Merge requested without category or id', { id, category: categoryId });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing category or id' }));
          return;
        }
        const categoryMedia = mediaByCategory[categoryId];
        if (!categoryMedia || !categoryMedia[id]) {
          log('warn', 'Merge requested with invalid media id', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid media id' }));
          return;
        }
        const media = categoryMedia[id];
        const jobId = id;
        const channel = Buffer.from(jobId).toString('base64');
        if (!media.available || !media.mergeable) {
          log('warn', 'Merge requested for unavailable media', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Media not available for merge' }));
          return;
        }
        log('info', 'Starting merge job', { media: media.name, dir: jobId });
        mergeMedia({
          media,
          channel,
          categoryId,
          broadcastEvent,
          refreshCategory: scanCategory
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'started', jobId, channel }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  if (method === 'POST' && url.pathname === '/api/remux') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const id = data.id;
        const categoryId = data.category;
        const mode = data.mode || 'single';
        const threads = Number.isFinite(data.threads)
          ? Math.max(1, Math.min(data.threads, 16))
          : 4;
        if (!categoryId || !id) {
          log('warn', 'Remux requested without category or id', { id, category: categoryId });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing category or id' }));
          return;
        }
        const categoryMedia = remuxByCategory[categoryId];
        if (!categoryMedia) {
          log('warn', 'Remux requested with invalid media id', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid media id' }));
          return;
        }
        const group = categoryMedia[id];
        if (group && mode === 'all') {
          const remuxable = Array.isArray(group.items)
            ? group.items.filter((item) => item.remuxable)
            : [];
          if (!group.available || remuxable.length === 0) {
            log('warn', 'Batch remux requested for unavailable media', { id });
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Media not available for remux' }));
            return;
          }
          const jobId = id;
          const channel = Buffer.from(`remux-group:${jobId}`).toString('base64');
          log('info', 'Starting batch remux job', { media: group.name, dir: jobId });
          remuxGroup({
            group,
            channel,
            categoryId,
            threads,
            broadcastEvent,
            refreshCategory: scanRemuxCategory
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'started', jobId, channel }));
          return;
        }
        let media = null;
        Object.values(categoryMedia).some((candidate) => {
          if (!candidate.items) return false;
          const match = candidate.items.find((item) => item.id === id);
          if (match) {
            media = match;
            return true;
          }
          return false;
        });
        if (!media) {
          log('warn', 'Remux requested with invalid media id', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid media id' }));
          return;
        }
        if (!media.available || !media.remuxable) {
          log('warn', 'Remux requested for unavailable media', { id });
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Media not available for remux' }));
          return;
        }
        const jobId = id;
        const channel = Buffer.from(`remux:${jobId}`).toString('base64');
        log('info', 'Starting remux job', { media: media.name, dir: jobId });
        remuxMedia({ media, channel, broadcastEvent }).then(() => {
          scanRemuxCategory(categoryId).catch((err) => {
            console.error('Refresh failed after remux:', err);
          });
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'started', jobId, channel }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  if (method === 'GET') {
    return serveStatic(url.pathname, res);
  }
  res.statusCode = 404;
  res.end('Not found');
}

module.exports = { requestHandler };
