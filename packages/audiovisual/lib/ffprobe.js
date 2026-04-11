#!/usr/bin/env node
'use strict';

/**
 * ffprobe.js — FFprobe wrapper for video metadata extraction
 * Story: AV-2.1
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function checkFFprobe() {
  try {
    execSync('ffprobe -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runFFprobe(videoPath) {
  if (!checkFFprobe()) {
    throw new Error(
      'FFprobe not found. Install FFmpeg:\n' +
      '  macOS: brew install ffmpeg\n' +
      '  Ubuntu: sudo apt install ffmpeg\n' +
      '  Windows: choco install ffmpeg',
    );
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const cmd = [
    'ffprobe',
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    `"${videoPath}"`,
  ].join(' ');

  const raw = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(raw);
}

function extractMetadata(videoPath) {
  const probe = runFFprobe(videoPath);

  const videoStream = (probe.streams || []).find(s => s.codec_type === 'video');
  const audioStream = (probe.streams || []).find(s => s.codec_type === 'audio');
  const format = probe.format || {};

  const duration = parseFloat(format.duration || '0');
  const hours = Math.floor(duration / 3600);
  const mins = Math.floor((duration % 3600) / 60);
  const secs = Math.floor(duration % 60);
  const durationFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const metadata = {
    duration: durationFormatted,
    durationSeconds: duration,
    resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'unknown',
    width: videoStream ? videoStream.width : 0,
    height: videoStream ? videoStream.height : 0,
    fps: videoStream ? parseFloat(eval(videoStream.r_frame_rate || '0')) : 0,
    codec: videoStream ? videoStream.codec_name : 'unknown',
    bitrate: format.bit_rate ? `${Math.round(parseInt(format.bit_rate) / 1000)}kbps` : 'unknown',
    bitrateKbps: format.bit_rate ? Math.round(parseInt(format.bit_rate) / 1000) : 0,
    fileSizeBytes: format.size ? parseInt(format.size) : 0,
    audio: audioStream ? {
      codec: audioStream.codec_name,
      channels: audioStream.channels,
      sampleRate: parseInt(audioStream.sample_rate || '0'),
    } : null,
    format: format.format_name || 'unknown',
    filename: path.basename(videoPath),
  };

  return metadata;
}

module.exports = {
  checkFFprobe,
  runFFprobe,
  extractMetadata,
};
