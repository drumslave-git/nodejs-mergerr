const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log');

function mergeMedia({ media, channel, categoryId, broadcastEvent, refreshCategory }) {
  const dirPath = media.id;
  const parentName = media.name;
  const fileListPath = path.join(dirPath, 'concat-list.txt');
  const outputFileName = `${parentName}.mp4`;
  const outputFilePath = path.join(dirPath, outputFileName);
  if (fs.existsSync(outputFilePath)) {
    fs.unlinkSync(outputFilePath);
  }
  log('info', 'Preparing merge', {
    media: parentName,
    parts: media.files.length,
    output: outputFilePath
  });
  const listContent = media.files
    .map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(fileListPath, listContent, 'utf8');
  const ffmpegArgs = ['-f', 'concat', '-safe', '0', '-i', fileListPath, '-c', 'copy', outputFilePath];
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  log('info', 'ffmpeg started', { args: ffmpegArgs });
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
    const message = code === 0 ? 'Merge completed' : `ffmpeg exited with code ${code}`;
    sendLog(`\n${message}\n`);
    log(code === 0 ? 'info' : 'error', 'ffmpeg process finished', { code });
    fs.unlink(fileListPath, (err) => {
      if (err) {
        console.error('Failed to remove list file:', err);
      }
    });
    if (categoryId && refreshCategory) {
      refreshCategory(categoryId).catch((err) => {
        console.error('Refresh failed after merge:', err);
      });
    }
  });
}

module.exports = { mergeMedia };
