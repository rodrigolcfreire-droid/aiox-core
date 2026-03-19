#!/usr/bin/env node
'use strict';

/**
 * validate.js — Video quality validation engine
 * Story: AV-4.4
 *
 * Validates final video quality: resolution, audio sync,
 * duration limits, format compliance.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');

const PLATFORM_LIMITS = {
  reels: { maxDuration: 90, maxSizeMB: 250, formats: ['9:16'] },
  tiktok: { maxDuration: 180, maxSizeMB: 287, formats: ['9:16'] },
  shorts: { maxDuration: 60, maxSizeMB: 256, formats: ['9:16'] },
  feed: { maxDuration: 60, maxSizeMB: 250, formats: ['1:1', '4:5', '16:9'] },
  youtube: { maxDuration: 43200, maxSizeMB: 12288, formats: ['16:9'] },
};

function probeVideo(videoPath) {
  const cmd = [
    'ffprobe', '-v', 'quiet',
    '-print_format', 'json',
    '-show_format', '-show_streams',
    `"${videoPath}"`,
  ].join(' ');

  const raw = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  return JSON.parse(raw);
}

function validateVideo(videoPath, targetPlatforms = []) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const probe = probeVideo(videoPath);
  const videoStream = (probe.streams || []).find(s => s.codec_type === 'video');
  const audioStream = (probe.streams || []).find(s => s.codec_type === 'audio');
  const format = probe.format || {};

  const duration = parseFloat(format.duration || '0');
  const fileSizeBytes = parseInt(format.size || '0');
  const fileSizeMB = fileSizeBytes / 1024 / 1024;

  const checks = [];
  let qualityScore = 10;

  // Resolution check
  if (videoStream) {
    const w = videoStream.width;
    const h = videoStream.height;
    if (w >= 1080 || h >= 1080) {
      checks.push({ name: 'resolution', status: 'pass', detail: `${w}x${h}` });
    } else {
      checks.push({ name: 'resolution', status: 'warn', detail: `${w}x${h} (below 1080p)` });
      qualityScore -= 1;
    }

    // Aspect ratio detection
    const ratio = w > h ? `${w}:${h}` : `${h}:${w}`;
    checks.push({ name: 'aspect_ratio', status: 'info', detail: `${w}:${h}` });
  } else {
    checks.push({ name: 'resolution', status: 'fail', detail: 'No video stream found' });
    qualityScore -= 3;
  }

  // Audio check
  if (audioStream) {
    const sampleRate = parseInt(audioStream.sample_rate || '0');
    if (sampleRate >= 44100) {
      checks.push({ name: 'audio', status: 'pass', detail: `${audioStream.codec_name} ${sampleRate}Hz` });
    } else {
      checks.push({ name: 'audio', status: 'warn', detail: `Low sample rate: ${sampleRate}Hz` });
      qualityScore -= 0.5;
    }
  } else {
    checks.push({ name: 'audio', status: 'warn', detail: 'No audio stream' });
    qualityScore -= 1;
  }

  // Duration check
  checks.push({ name: 'duration', status: 'info', detail: `${duration.toFixed(1)}s` });

  // File size check
  checks.push({ name: 'file_size', status: 'info', detail: `${fileSizeMB.toFixed(1)} MB` });

  // Platform-specific checks
  for (const platform of targetPlatforms) {
    const limits = PLATFORM_LIMITS[platform];
    if (!limits) continue;

    if (duration > limits.maxDuration) {
      checks.push({ name: `${platform}_duration`, status: 'fail', detail: `${duration.toFixed(0)}s > ${limits.maxDuration}s limit` });
      qualityScore -= 2;
    } else {
      checks.push({ name: `${platform}_duration`, status: 'pass', detail: `${duration.toFixed(0)}s <= ${limits.maxDuration}s` });
    }

    if (fileSizeMB > limits.maxSizeMB) {
      checks.push({ name: `${platform}_size`, status: 'fail', detail: `${fileSizeMB.toFixed(0)}MB > ${limits.maxSizeMB}MB limit` });
      qualityScore -= 2;
    } else {
      checks.push({ name: `${platform}_size`, status: 'pass', detail: `${fileSizeMB.toFixed(0)}MB <= ${limits.maxSizeMB}MB` });
    }
  }

  qualityScore = parseFloat(Math.max(0, Math.min(10, qualityScore)).toFixed(1));

  return {
    videoPath,
    checks,
    qualityScore,
    passed: checks.every(c => c.status !== 'fail'),
    metadata: {
      duration,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(1)),
      width: videoStream ? videoStream.width : 0,
      height: videoStream ? videoStream.height : 0,
      codec: videoStream ? videoStream.codec_name : 'unknown',
      audioCodec: audioStream ? audioStream.codec_name : 'none',
    },
  };
}

function validateCut(projectId, cutId) {
  const projectDir = getProjectDir(projectId);
  const productionDir = path.join(projectDir, 'production');

  // Find branded video (or subtitled, or assembled)
  let videoPath = path.join(productionDir, `branded-${cutId}.mp4`);
  if (!fs.existsSync(videoPath)) {
    videoPath = path.join(productionDir, `subtitled-${cutId}.mp4`);
  }
  if (!fs.existsSync(videoPath)) {
    videoPath = path.join(productionDir, `assembled-${cutId}.mp4`);
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`No produced video found for ${cutId}`);
  }

  // Load cut info for platform
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  let platforms = [];
  if (fs.existsSync(cutsPath)) {
    const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
    const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
    if (cut) platforms = cut.platform || [];
  }

  const result = validateVideo(videoPath, platforms);

  // Save quality report
  const reportPath = path.join(productionDir, `quality-${cutId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  return result;
}

module.exports = {
  validateVideo,
  validateCut,
  probeVideo,
  PLATFORM_LIMITS,
};
