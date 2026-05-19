'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { log } = require('../log');
const { broadcast } = require('../http/sse');
const { scanner } = require('./scanner');
const { getRemuxOutputPathForJob } = require('./fileUtils');

function buildFfmpegArgs(videoFilePath, audioTracks, outputFilePath) {
  const args = ['-i', videoFilePath];
  audioTracks.forEach((track) => args.push('-i', track.path));
  args.push('-map', '0:v:0');
  audioTracks.forEach((track, index) => {
    args.push('-map', `${index + 1}:a:0`);
    if (track.label) {
      args.push(`-metadata:s:a:${index}`, `title=${track.label}`);
    }
  });
  args.push('-map', '0:a?', '-c', 'copy', outputFilePath);
  return args;
}

function runRemuxJob(item, channel) {
  return new Promise((resolve) => {
    const audioTracks =
      Array.isArray(item.audioTracks) && item.audioTracks.length
        ? item.audioTracks
        : (item.audioFiles || []).map((p) => ({ path: p, label: '' }));
    const outputFilePath = getRemuxOutputPathForJob(item.videoFile);
    if (outputFilePath && fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }
    log('info', 'Preparing remux', {
      media: item.name,
      video: item.videoFile,
      audioTracks: audioTracks.length,
      output: outputFilePath
    });
    const args = buildFfmpegArgs(item.videoFile, audioTracks, outputFilePath);
    log('info', 'ffmpeg started for remux', { args });
    const ffmpeg = spawn('ffmpeg', args);
    const onData = (data) => broadcast('log', { channel, message: data.toString() });
    ffmpeg.stdout.on('data', onData);
    ffmpeg.stderr.on('data', onData);
    ffmpeg.on('close', (code) => {
      const ok = code === 0;
      broadcast('log', { channel, message: `\n${ok ? 'Remux completed' : `ffmpeg exited with code ${code}`}\n` });
      log(ok ? 'info' : 'error', 'Remux finished', { code });
      resolve(code);
    });
    ffmpeg.on('error', (err) => {
      log('error', 'ffmpeg failed to start', { message: err.message });
      broadcast('log', { channel, message: `\nffmpeg failed to start: ${err.message}\n` });
      resolve(-1);
    });
  });
}

function refreshRemuxCache(categoryId) {
  if (!categoryId) return;
  scanner.scanRemux(categoryId).catch((err) =>
    log('warn', 'Refresh failed after remux', { message: err.message })
  );
}

function startRemuxSingle(item, categoryId) {
  const channel = randomUUID();
  const jobId = item.id;
  void (async () => {
    let code = -1;
    try {
      code = await runRemuxJob(item, channel);
    } catch (err) {
      log('error', 'Remux job crashed', { jobId, message: err.message });
      broadcast('log', { channel, message: `\nRemux failed: ${err.message}\n` });
    }
    broadcast('done', { channel, status: code === 0 ? 'ok' : 'error', code });
    refreshRemuxCache(categoryId);
  })();
  return { jobId, channel };
}

function startRemuxGroup(group, categoryId, threads) {
  const channel = randomUUID();
  const jobId = group.id;
  void runGroup(group, categoryId, channel, threads);
  return { jobId, channel };
}

async function runGroup(group, categoryId, channel, threads) {
  const remuxTargets = group.items.filter((item) => item.remuxable);
  const total = remuxTargets.length;
  if (total === 0) {
    broadcast('log', { channel, message: '\nNothing to remux.\n' });
    broadcast('done', { channel, status: 'ok', code: 0 });
    return;
  }

  const concurrency = Math.max(1, Math.min(threads || 4, total));
  let cursor = 0;
  let completed = 0;
  let failed = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const item = remuxTargets[index];
      broadcast('log', {
        channel,
        message: `\n[${index + 1}/${total}] Remuxing ${path.basename(item.videoFile)}\n`
      });
      try {
        const code = await runRemuxJob(item, channel);
        if (code !== 0) failed += 1;
      } catch (err) {
        log('error', 'Remux item failed', { id: item.id, message: err.message });
        broadcast('log', { channel, message: `\nRemux failed: ${err.message}\n` });
        failed += 1;
      } finally {
        completed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  const status = failed === 0 ? 'ok' : 'error';
  broadcast('log', {
    channel,
    message: `\nBatch remux completed (${completed}/${total}${failed ? `, ${failed} failed` : ''})\n`
  });
  broadcast('done', { channel, status, completed, failed, total });
  refreshRemuxCache(categoryId);
}

module.exports = { startRemuxSingle, startRemuxGroup };
