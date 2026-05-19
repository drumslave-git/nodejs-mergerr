'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { log } = require('../log');
const { broadcast } = require('../http/sse');
const { scanner } = require('./scanner');

function writeConcatList(dirPath, files) {
  const listPath = path.join(dirPath, 'concat-list.txt');
  const content = files.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, content, 'utf8');
  return listPath;
}

function runFfmpeg(args, channel) {
  return new Promise((resolve) => {
    log('info', 'ffmpeg started', { args });
    const ffmpeg = spawn('ffmpeg', args);
    const onData = (data) => broadcast('log', { channel, message: data.toString() });
    ffmpeg.stdout.on('data', onData);
    ffmpeg.stderr.on('data', onData);
    ffmpeg.on('close', (code) => resolve(code));
    ffmpeg.on('error', (err) => {
      log('error', 'ffmpeg failed to start', { message: err.message });
      broadcast('log', { channel, message: `\nffmpeg failed to start: ${err.message}\n` });
      resolve(-1);
    });
  });
}

function refreshMergeCache(categoryId) {
  if (!categoryId) return;
  scanner.scanMerge(categoryId).catch((err) =>
    log('warn', 'Refresh failed after merge', { message: err.message })
  );
}

/**
 * Starts a merge job for a multi-part media folder.
 * Returns immediately with a channel id; progress is streamed via SSE.
 */
function startMerge(media, categoryId) {
  const channel = randomUUID();
  const jobId = media.id;
  void runMergeJob(media, categoryId, channel);
  return { jobId, channel };
}

async function runMergeJob(media, categoryId, channel) {
  const dirPath = media.id;
  const outputFilePath = path.join(dirPath, `${media.name}.mp4`);
  let listPath = null;
  let code = -1;

  try {
    if (fs.existsSync(outputFilePath)) {
      await fsp.unlink(outputFilePath);
    }
    log('info', 'Preparing merge', {
      media: media.name,
      parts: media.files.length,
      output: outputFilePath
    });
    listPath = writeConcatList(dirPath, media.files);
    code = await runFfmpeg(
      ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputFilePath],
      channel
    );
  } catch (err) {
    log('error', 'Merge job crashed', { jobId: media.id, message: err.message });
    broadcast('log', { channel, message: `\nMerge failed: ${err.message}\n` });
  }

  const ok = code === 0;
  broadcast('log', {
    channel,
    message: `\n${ok ? 'Merge completed' : `ffmpeg exited with code ${code}`}\n`
  });
  broadcast('done', { channel, status: ok ? 'ok' : 'error', code });
  log(ok ? 'info' : 'error', 'Merge finished', { code });

  if (listPath) {
    await fsp.unlink(listPath).catch((err) =>
      log('warn', 'Failed to remove concat list', { message: err.message })
    );
  }
  refreshMergeCache(categoryId);
}

module.exports = { startMerge };
