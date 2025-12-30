const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log');
const { getRemuxOutputPathForJob } = require('./fileUtils');

function remuxMedia({ media, channel, broadcastEvent }) {
  const videoFilePath = media.videoFile;
  const audioTracks =
    Array.isArray(media.audioTracks) && media.audioTracks.length
      ? media.audioTracks
      : (media.audioFiles || []).map((audioPath) => ({ path: audioPath, label: '' }));
  const outputFilePath = getRemuxOutputPathForJob(videoFilePath);
  if (outputFilePath && fs.existsSync(outputFilePath)) {
    fs.unlinkSync(outputFilePath);
  }
  log('info', 'Preparing remux', {
    media: media.name,
    video: videoFilePath,
    audioTracks: audioTracks.length,
    output: outputFilePath
  });
  const ffmpegArgs = ['-i', videoFilePath];
  audioTracks.forEach((track) => {
    ffmpegArgs.push('-i', track.path);
  });
  ffmpegArgs.push('-map', '0:v:0');
  audioTracks.forEach((track, index) => {
    ffmpegArgs.push('-map', `${index + 1}:a:0`);
    if (track.label) {
      ffmpegArgs.push(`-metadata:s:a:${index}`, `title=${track.label}`);
    }
  });
  ffmpegArgs.push('-map', '0:a?');
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

async function remuxGroup({ group, channel, categoryId, threads, broadcastEvent, refreshCategory }) {
  const items = Array.isArray(group.items) ? group.items : [];
  const remuxTargets = items.filter((item) => item.remuxable);
  const maxThreads = Math.max(1, Math.min(threads || 4, remuxTargets.length || 1));
  let completed = 0;
  let active = 0;
  let index = 0;

  await new Promise((resolve) => {
    const scheduleNext = () => {
      while (active < maxThreads && index < remuxTargets.length) {
        const item = remuxTargets[index];
        index += 1;
        active += 1;
        broadcastEvent('log', {
          channel,
          message: `\n[${completed + 1}/${remuxTargets.length}] Remuxing ${path.basename(
            item.videoFile
          )}\n`
        });
        remuxMedia({ media: item, channel, broadcastEvent }).then(() => {
          completed += 1;
          active -= 1;
          if (completed >= remuxTargets.length) {
            resolve();
            return;
          }
          scheduleNext();
        });
      }
      if (remuxTargets.length === 0) {
        resolve();
      }
    };
    scheduleNext();
  });
  broadcastEvent('log', { channel, message: '\nBatch remux completed\n' });
  if (categoryId && refreshCategory) {
    refreshCategory(categoryId).catch((err) => {
      console.error('Refresh failed after remux:', err);
    });
  }
}

module.exports = { remuxMedia, remuxGroup };
