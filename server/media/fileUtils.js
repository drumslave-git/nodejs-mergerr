'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v']);
const AUDIO_EXTENSIONS = new Set([
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
]);

const isVideoFile = (name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
const isAudioFile = (name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase());

function rootFolderCandidates(torrent) {
  const names = [];
  const torrentName = torrent?.name;
  if (torrentName) {
    names.push(torrentName);
    if (torrentName.toLowerCase().endsWith('.torrent')) {
      names.push(torrentName.slice(0, -'.torrent'.length));
    }
  }
  if (torrent?.content_path) {
    const base = path.basename(torrent.content_path);
    if (base && base !== '.' && base !== '..') names.push(base);
  }
  return [...new Set(names.filter(Boolean))];
}

function matchesRootPrefix(fileNames, rootFolder) {
  const posix = `${rootFolder}/`;
  const win = `${rootFolder}\\`;
  return fileNames.some((name) => name.startsWith(posix) || name.startsWith(win));
}

/** When every file shares one top-level directory, use that as the torrent root. */
function inferRootFolderFromPaths(fileNames) {
  if (!fileNames.length) return '';
  let root = null;
  for (const fullName of fileNames) {
    const slash = fullName.indexOf('/');
    const back = fullName.indexOf('\\');
    let sepIdx = -1;
    if (slash === -1) sepIdx = back;
    else if (back === -1) sepIdx = slash;
    else sepIdx = Math.min(slash, back);
    if (sepIdx <= 0) return '';
    const segment = fullName.slice(0, sepIdx);
    if (root === null) root = segment;
    else if (root !== segment) return '';
  }
  if (!root || !matchesRootPrefix(fileNames, root)) return '';
  return root;
}

function detectRootFolder(torrent, fileNames) {
  for (const name of rootFolderCandidates(torrent)) {
    if (matchesRootPrefix(fileNames, name)) return name;
  }
  return inferRootFolderFromPaths(fileNames);
}

function stripRoot(fullName, rootFolder) {
  if (!rootFolder) return fullName;
  const posix = `${rootFolder}/`;
  const win = `${rootFolder}\\`;
  if (fullName.startsWith(posix)) return fullName.slice(posix.length);
  if (fullName.startsWith(win)) return fullName.slice(win.length);
  return fullName;
}

/**
 * Normalizes qBittorrent's per-torrent file listing into a tree-friendly shape:
 *   - basePath:   torrent.save_path
 *   - dirPath:    where the merged/remuxed output should live
 *   - topLevel:   files directly under the torrent root (no nested folders)
 *   - allEntries: every file in the torrent
 */
function getFileListEntries(torrent, files) {
  const fileNames = (files || [])
    .map((file) => file && file.name)
    .filter((value) => typeof value === 'string');
  const rootFolder = detectRootFolder(torrent, fileNames);
  const name =
    rootFolder ||
    (torrent.name && torrent.name.toLowerCase().endsWith('.torrent')
      ? torrent.name.slice(0, -'.torrent'.length)
      : torrent.name) ||
    torrent.hash ||
    'Torrent';
  const basePath = torrent.save_path || '';

  let dirPath = basePath;
  if (rootFolder && basePath) {
    dirPath = path.join(basePath, rootFolder);
  } else if (!dirPath && torrent.content_path) {
    dirPath = path.dirname(torrent.content_path);
  }

  const toEntry = (fullName) => ({
    relativeName: fullName,
    fullPath: basePath ? path.join(basePath, fullName) : fullName
  });

  const topLevel = fileNames
    .map((fullName) => {
      const relativeName = stripRoot(fullName, rootFolder);
      if (relativeName.includes('/') || relativeName.includes('\\')) return null;
      return { relativeName, fullPath: basePath ? path.join(basePath, fullName) : fullName };
    })
    .filter(Boolean);

  return {
    name,
    basePath,
    dirPath,
    topLevel,
    allEntries: fileNames.map(toEntry),
    fileNames
  };
}

const normalizeStem = (fileName) =>
  path.basename(fileName, path.extname(fileName)).toLowerCase();

function getRemuxOutputPathPreview(videoFilePath) {
  const dir = path.dirname(videoFilePath);
  const ext = path.extname(videoFilePath);
  const base = path.basename(videoFilePath, ext);
  const suffix = ext.toLowerCase() === '.mkv' ? '.remux.mkv' : '.mkv';
  return path.join(dir, `${base}${suffix}`);
}

function getRemuxOutputPathForJob(videoFilePath) {
  const preferred = getRemuxOutputPathPreview(videoFilePath);
  if (!fs.existsSync(preferred)) return preferred;
  const dir = path.dirname(preferred);
  const base = path.basename(preferred, '.mkv');
  let counter = 1;
  let candidate = path.join(dir, `${base}-${counter}.mkv`);
  while (fs.existsSync(candidate)) {
    counter += 1;
    candidate = path.join(dir, `${base}-${counter}.mkv`);
  }
  return candidate;
}

module.exports = {
  isVideoFile,
  isAudioFile,
  detectRootFolder,
  rootFolderCandidates,
  inferRootFolderFromPaths,
  getFileListEntries,
  normalizeStem,
  getRemuxOutputPathPreview,
  getRemuxOutputPathForJob
};
