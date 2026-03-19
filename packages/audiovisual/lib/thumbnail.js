#!/usr/bin/env node
'use strict';

/**
 * thumbnail.js — Thumbnail generation from video frames
 * Story: AV-9.2
 *
 * Extracts frames from video at specific timestamps
 * using FFmpeg for preview images.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');

function extractFrame(videoPath, timestamp, outputPath, width = 640) {
  const cmd = [
    'ffmpeg', '-y',
    '-ss', String(timestamp),
    '-i', `"${videoPath}"`,
    '-vframes', '1',
    '-vf', `"scale=${width}:-1"`,
    '-q:v', '2',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

function generateThumbnail(videoPath, timestamp, outputPath) {
  return extractFrame(videoPath, timestamp, outputPath);
}

function generateCutThumbnails(projectId) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');

  if (!fs.existsSync(cutsPath)) {
    throw new Error(`No cuts found for project ${projectId}`);
  }

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));

  // Find source video
  const sourceDir = path.join(projectDir, 'source');
  const sourceFiles = fs.readdirSync(sourceDir);
  const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));

  if (!videoFile) {
    throw new Error('No source video found');
  }

  const videoPath = path.join(sourceDir, videoFile);
  const thumbDir = path.join(projectDir, 'cuts', 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });

  const results = [];

  for (const cut of cutsData.suggestedCuts) {
    // Extract frame at 1/3 of the cut (usually a good representative frame)
    const timestamp = cut.start + (cut.duration / 3);
    const thumbPath = path.join(thumbDir, `thumb-${cut.id}.jpg`);

    const success = extractFrame(videoPath, timestamp, thumbPath);
    results.push({
      cutId: cut.id,
      thumbnailPath: success ? thumbPath : null,
      timestamp,
      success,
    });
  }

  return {
    projectId,
    thumbnails: results,
    generated: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  };
}

module.exports = {
  extractFrame,
  generateThumbnail,
  generateCutThumbnails,
};
