'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { qbitClient } = require('../qbit/client');
const { log } = require('../log');
const {
  isVideoFile,
  isAudioFile,
  getFileListEntries,
  normalizeStem,
  getRemuxOutputPathPreview
} = require('./fileUtils');

function buildMergeItem(torrent, files) {
  const { name, dirPath, topLevel, fileNames } = getFileListEntries(torrent, files);
  const videoFiles = topLevel.filter((entry) => isVideoFile(entry.relativeName));
  const mergeable = videoFiles.length >= 2;
  const outputPath = dirPath && name ? path.join(dirPath, `${name}.mp4`) : '';
  const outputExists = outputPath ? fs.existsSync(outputPath) : false;

  let warning;
  if (fileNames.length === 0) warning = 'qBittorrent returned no files';
  else if (videoFiles.length === 0) warning = 'No video files found';
  else if (videoFiles.length === 1) warning = 'Single-file torrent; merge not needed';

  return {
    id: dirPath || torrent.content_path || torrent.save_path || torrent.hash,
    name,
    files: videoFiles.map((entry) => entry.fullPath),
    filesAll: topLevel.map((entry) => entry.fullPath),
    outputPath,
    outputExists,
    available: true,
    mergeable,
    warning
  };
}

function makeAudioLabel(videoRelativeName, audioRelativeName) {
  const videoBase = path.basename(videoRelativeName, path.extname(videoRelativeName));
  const audioBase = path.basename(audioRelativeName, path.extname(audioRelativeName));
  let label = audioBase;
  if (audioBase.toLowerCase().startsWith(videoBase.toLowerCase())) {
    label = audioBase.slice(videoBase.length).replace(/^[._\-\s]+/, '');
  }
  label = label.replace(/[._\-]+/g, ' ').trim();
  return label || audioBase;
}

function buildRemuxItem(videoEntry, audioFiles) {
  const videoStem = normalizeStem(videoEntry.relativeName);
  const matchingAudio = audioFiles.filter((audio) =>
    normalizeStem(audio.relativeName).startsWith(videoStem)
  );
  const audioTracks = matchingAudio.map((audio) => ({
    path: audio.fullPath,
    label: makeAudioLabel(videoEntry.relativeName, audio.relativeName)
  }));
  const outputPath = getRemuxOutputPathPreview(videoEntry.fullPath);
  return {
    id: videoEntry.fullPath,
    name: path.basename(videoEntry.relativeName),
    videoFile: videoEntry.fullPath,
    audioFiles: matchingAudio.map((entry) => entry.fullPath),
    audioTracks,
    outputPath,
    outputExists: outputPath ? fs.existsSync(outputPath) : false,
    available: true,
    remuxable: matchingAudio.length > 0,
    warning: matchingAudio.length === 0 ? 'No matching external audio tracks found' : undefined
  };
}

function buildRemuxGroup(torrent, files) {
  const { name, dirPath, topLevel, allEntries } = getFileListEntries(torrent, files);
  const videoFiles = topLevel.filter((entry) => isVideoFile(entry.relativeName));
  const audioFiles = allEntries.filter((entry) => isAudioFile(entry.relativeName));
  const groupId = torrent.hash || dirPath || torrent.content_path || torrent.save_path;
  const groupPath = dirPath || torrent.save_path || '';

  if (videoFiles.length === 0) {
    return {
      id: groupId,
      name,
      path: groupPath,
      items: [],
      available: true,
      warning: 'No video file found'
    };
  }

  return {
    id: groupId,
    name,
    path: groupPath,
    items: videoFiles.map((video) => buildRemuxItem(video, audioFiles)),
    available: true
  };
}

class Scanner {
  constructor() {
    this.mergeCache = new Map();
    this.remuxCache = new Map();
  }

  async scanMerge(categoryId) {
    const { torrents, error } = await qbitClient.listCompletedTorrents(categoryId);
    if (!torrents) return { media: null, error };
    const cache = new Map();
    for (const { torrent, files } of torrents) {
      const item = buildMergeItem(torrent, files);
      cache.set(item.id, item);
    }
    this.mergeCache.set(categoryId, cache);
    return { media: Object.fromEntries(cache), error: null };
  }

  async scanRemux(categoryId) {
    const { torrents, error } = await qbitClient.listCompletedTorrents(categoryId);
    if (!torrents) return { media: null, error };
    const cache = new Map();
    for (const { torrent, files } of torrents) {
      const group = buildRemuxGroup(torrent, files);
      cache.set(group.id, group);
    }
    log('info', 'Remux scan completed', {
      source: categoryId,
      directories: torrents.length,
      media: cache.size
    });
    this.remuxCache.set(categoryId, cache);
    return { media: Object.fromEntries(cache), error: null };
  }

  getMergeItem(categoryId, id) {
    return this.mergeCache.get(categoryId)?.get(id) || null;
  }

  getRemuxGroup(categoryId, id) {
    return this.remuxCache.get(categoryId)?.get(id) || null;
  }

  findRemuxItem(categoryId, itemId) {
    const groups = this.remuxCache.get(categoryId);
    if (!groups) return null;
    for (const group of groups.values()) {
      const match = group.items.find((item) => item.id === itemId);
      if (match) return match;
    }
    return null;
  }
}

const scanner = new Scanner();

module.exports = { scanner };
