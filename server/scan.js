const path = require('path');
const { fetchCompletedTorrentsWithFiles } = require('./qbitClient');
const { log } = require('./log');
const {
  isVideoFile,
  isAudioFile,
  getFileListEntries,
  normalizeStem,
  getRemuxOutputPathPreview
} = require('./fileUtils');

const mediaByCategory = {};
const remuxByCategory = {};

function buildTorrentEntryFromFiles(torrent, files) {
  const { name, dirPath, topLevel, fileNames } = getFileListEntries(torrent, files);
  const videoFiles = topLevel.filter((entry) => isVideoFile(entry.relativeName));
  const mergeable = videoFiles.length >= 2;
  let warning = '';
  if (fileNames.length === 0) {
    warning = 'qBittorrent returned no files';
  } else if (videoFiles.length === 0) {
    warning = 'No video files found';
  } else if (videoFiles.length === 1) {
    warning = 'Single-file torrent; merge not needed';
  }

  return {
    id: dirPath || torrent.content_path || torrent.save_path || torrent.hash,
    name,
    files: videoFiles.map((entry) => entry.fullPath),
    filesAll: topLevel.map((entry) => entry.fullPath),
    available: true,
    mergeable,
    warning: warning || undefined
  };
}

function buildRemuxGroupFromFiles(torrent, files) {
  const { name, dirPath, topLevel, allEntries } = getFileListEntries(torrent, files);
  const videoFiles = topLevel.filter((entry) => isVideoFile(entry.relativeName));
  const audioFiles = allEntries.filter((entry) => isAudioFile(entry.relativeName));
  const groupId = torrent.hash || dirPath || torrent.content_path || torrent.save_path;

  if (videoFiles.length === 0) {
    return {
      id: groupId,
      name,
      path: dirPath || torrent.save_path || '',
      items: [],
      available: true,
      warning: 'No video file found'
    };
  }

  const items = videoFiles.map((videoEntry) => {
    const videoStem = normalizeStem(videoEntry.relativeName);
    const matchingAudio = audioFiles.filter((audioEntry) => {
      const audioStem = normalizeStem(audioEntry.relativeName);
      return audioStem.startsWith(videoStem);
    });
    const outputPath = getRemuxOutputPathPreview(videoEntry.fullPath);
    let warning = '';
    if (matchingAudio.length === 0) {
      warning = 'No matching external audio tracks found';
    }
    return {
      id: videoEntry.fullPath,
      name: path.basename(videoEntry.relativeName),
      videoFile: videoEntry.fullPath,
      audioFiles: matchingAudio.map((entry) => entry.fullPath),
      outputPath,
      available: true,
      remuxable: matchingAudio.length > 0,
      warning: warning || undefined
    };
  });

  return {
    id: groupId,
    name,
    path: dirPath || torrent.save_path || '',
    items,
    available: true
  };
}

async function scanCategory(categoryId) {
  const { torrents, error } = await fetchCompletedTorrentsWithFiles(categoryId);
  if (!torrents) {
    return { media: null, error };
  }
  const scanned = {};
  torrents.forEach(({ torrent, files }) => {
    const entry = buildTorrentEntryFromFiles(torrent, files);
    scanned[entry.id] = entry;
  });
  mediaByCategory[categoryId] = scanned;
  return { media: scanned, error: null };
}

async function scanRemuxCategory(categoryId) {
  const { torrents, error } = await fetchCompletedTorrentsWithFiles(categoryId);
  if (!torrents) {
    return { media: null, error };
  }
  const result = {};
  torrents.forEach(({ torrent, files }) => {
    const remuxGroup = buildRemuxGroupFromFiles(torrent, files);
    result[remuxGroup.id] = remuxGroup;
  });
  log('info', 'Remux scan completed', {
    source: categoryId || 'category',
    directories: torrents.length,
    media: Object.keys(result).length
  });
  remuxByCategory[categoryId] = result;
  return { media: result, error: null };
}

module.exports = { scanCategory, scanRemuxCategory, mediaByCategory, remuxByCategory };
