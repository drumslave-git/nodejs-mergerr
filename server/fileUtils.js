const fs = require('fs');
const path = require('path');

function isVideoFile(fileName) {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.m4v'];
  return videoExtensions.includes(path.extname(fileName).toLowerCase());
}

function isAudioFile(fileName) {
  const audioExtensions = [
    '.mka',
    '.aac',
    '.ac3',
    '.eac3',
    '.dts',
    '.flac',
    '.mp3',
    '.ogg',
    '.opus',
    '.wav',
    '.m4a'
  ];
  return audioExtensions.includes(path.extname(fileName).toLowerCase());
}

function detectRootFolder(torrentName, fileNames) {
  if (!torrentName) return '';
  const prefix = `${torrentName}/`;
  const winPrefix = `${torrentName}\\`;
  return fileNames.some((name) => name.startsWith(prefix) || name.startsWith(winPrefix))
    ? torrentName
    : '';
}

function getFileListEntries(torrent, files) {
  const name = torrent.name || torrent.hash || 'Torrent';
  const fileNames = (files || [])
    .map((file) => file && file.name)
    .filter((value) => typeof value === 'string');
  const rootFolder = detectRootFolder(torrent.name, fileNames);
  const basePath = torrent.save_path || '';
  let dirPath = basePath;
  if (rootFolder && basePath) {
    dirPath = path.join(basePath, rootFolder);
  } else if (!dirPath && torrent.content_path) {
    dirPath = path.dirname(torrent.content_path);
  }

  const prefix = rootFolder ? `${rootFolder}/` : '';
  const winPrefix = rootFolder ? `${rootFolder}\\` : '';
  const topLevel = fileNames
    .map((fullName) => {
      let relativeName = fullName;
      if (rootFolder && fullName.startsWith(prefix)) {
        relativeName = fullName.slice(prefix.length);
      } else if (rootFolder && fullName.startsWith(winPrefix)) {
        relativeName = fullName.slice(winPrefix.length);
      }
      if (relativeName.includes('/') || relativeName.includes('\\')) {
        return null;
      }
      const fullPath = basePath ? path.join(basePath, fullName) : fullName;
      return { relativeName, fullPath };
    })
    .filter(Boolean);
  const allEntries = fileNames.map((fullName) => ({
    relativeName: fullName,
    fullPath: basePath ? path.join(basePath, fullName) : fullName
  }));

  return {
    name,
    basePath,
    dirPath,
    topLevel,
    allEntries,
    fileNames
  };
}

function normalizeStem(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  return base.toLowerCase();
}

function getRemuxOutputPathPreview(videoFilePath) {
  const dirPath = path.dirname(videoFilePath);
  const ext = path.extname(videoFilePath);
  const baseName = path.basename(videoFilePath, ext);
  if (ext.toLowerCase() === '.mkv') {
    return path.join(dirPath, `${baseName}.remux.mkv`);
  }
  return path.join(dirPath, `${baseName}.mkv`);
}

function getRemuxOutputPathForJob(videoFilePath) {
  const preferred = getRemuxOutputPathPreview(videoFilePath);
  if (!fs.existsSync(preferred)) {
    return preferred;
  }
  const dirPath = path.dirname(preferred);
  const baseName = path.basename(preferred, '.mkv');
  let counter = 1;
  let fallback = path.join(dirPath, `${baseName}-${counter}.mkv`);
  while (fs.existsSync(fallback)) {
    counter += 1;
    fallback = path.join(dirPath, `${baseName}-${counter}.mkv`);
  }
  return fallback;
}

module.exports = {
  isVideoFile,
  isAudioFile,
  detectRootFolder,
  getFileListEntries,
  normalizeStem,
  getRemuxOutputPathPreview,
  getRemuxOutputPathForJob
};
