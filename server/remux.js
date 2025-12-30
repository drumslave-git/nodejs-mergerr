const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log');
const { getRemuxOutputPathForJob } = require('./fileUtils');

function remuxMedia({ media, channel, broadcastEvent }) {
  const videoFilePath = media.videoFile;
  const audioFiles = media.audioFiles || [];
  const outputFilePath = getRemuxOutputPathForJob(videoFilePath);
  log('info', 'Preparing remux', {
    media: media.name,
    video: videoFilePath,
    audioTracks: audioFiles.length,
    output: outputFilePath
  });
  const ffmpegArgs = ['-i', videoFilePath];
  audioFiles.forEach((audioPath) => {
    ffmpegArgs.push('-i', audioPath);
  });
  ffmpegArgs.push('-map', '0:v:0');
  audioFiles.forEach((_, index) => {
    ffmpegArgs.push('-map', `${index + 1}:a:0`);
  });
  ffmpegArgs.push('-c', 'copy', outputFilePath);
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  log('info', 'ffmpeg started for remux', { args: ffmpegArgs });
  return new Promise((resolve) => {
    function sendLog(message) {
      broadcastEvent('log', { channel, message });
    }
    ffmpeg.stdout.on('data', (data) => {
      sendLog(data.toString());
    });
    ffmpeg.stderr.on('data', (data) => {
      sendLog(data.toString());
    });
    ffmpeg.on('close', (code) => {
      const message = code === 0 ? 'Remux completed' : `ffmpeg exited with code ${code}`;
      sendLog(`\n${message}\n`);
      log(code === 0 ? 'info' : 'error', 'ffmpeg remux process finished', { code });
      resolve(code);
    });
  });
}

async function remuxGroup({ group, channel, categoryId, broadcastEvent, refreshCategory }) {
  const items = Array.isArray(group.items) ? group.items : [];
  const remuxTargets = items.filter((item) => item.remuxable);
  let completed = 0;
  for (const item of remuxTargets) {
    completed += 1;
    broadcastEvent('log', {
      channel,
      message: `\n[${completed}/${remuxTargets.length}] Remuxing ${path.basename(
        item.videoFile
      )}\n`
    });
    // eslint-disable-next-line no-await-in-loop
    await remuxMedia({ media: item, channel, broadcastEvent });
  }
  broadcastEvent('log', { channel, message: '\nBatch remux completed\n' });
  if (categoryId && refreshCategory) {
    refreshCategory(categoryId).catch((err) => {
      console.error('Refresh failed after remux:', err);
    });
  }
}

module.exports = { remuxMedia, remuxGroup };
