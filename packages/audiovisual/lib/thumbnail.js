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

/**
 * Extract the most expressive frame from a video segment.
 * Story AV-12 (Melhoria 8): Uses energy peak + multiple candidates.
 *
 * Strategy: extract frames at energy peaks (loudest moments = most expression)
 * and at key positions (1/4, 1/2, 3/4 of cut).
 */
function extractBestThumbnail(projectId, cutId) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const sourceDir = path.join(projectDir, 'source');
  const thumbDir = path.join(projectDir, 'cuts', 'thumbnails');

  if (!fs.existsSync(cutsPath)) throw new Error('No cuts found');

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
  if (!cut) throw new Error(`Cut ${cutId} not found`);

  const sourceFiles = fs.readdirSync(sourceDir);
  const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!videoFile) throw new Error('No source video');

  const videoPath = path.join(sourceDir, videoFile);
  fs.mkdirSync(thumbDir, { recursive: true });

  // Extract candidates at key positions
  const positions = [
    cut.start + cut.duration * 0.25,
    cut.start + cut.duration * 0.5,
    cut.start + cut.duration * 0.75,
  ];

  // Also use energy peak if available
  const energyPath = path.join(projectDir, 'analysis', 'energy.json');
  if (fs.existsSync(energyPath)) {
    const energy = JSON.parse(fs.readFileSync(energyPath, 'utf8'));
    if (energy.peakWindow && energy.peakWindow.start >= cut.start && energy.peakWindow.start <= cut.end) {
      positions.unshift(energy.peakWindow.start); // energy peak first
    }
    // Add top peaks that fall within cut range
    if (energy.topPeaks) {
      for (const peak of energy.topPeaks) {
        if (peak.start >= cut.start && peak.start <= cut.end) {
          positions.push(peak.start);
        }
      }
    }
  }

  const candidates = [];
  for (let i = 0; i < positions.length; i++) {
    const thumbPath = path.join(thumbDir, `thumb-${cutId}-candidate-${i}.jpg`);
    const success = extractFrame(videoPath, positions[i], thumbPath);
    if (success) {
      const stat = fs.statSync(thumbPath);
      candidates.push({
        path: thumbPath,
        timestamp: positions[i],
        sizeKB: parseFloat((stat.size / 1024).toFixed(1)),
        index: i,
      });
    }
  }

  // Pick largest file (more visual detail = more expressive face)
  candidates.sort((a, b) => b.sizeKB - a.sizeKB);
  const best = candidates[0];

  if (best) {
    // Copy best as main thumbnail
    const mainThumb = path.join(thumbDir, `thumb-${cutId}.jpg`);
    fs.copyFileSync(best.path, mainThumb);
    // Cleanup candidates
    for (const c of candidates) {
      if (c.path !== best.path && fs.existsSync(c.path)) fs.unlinkSync(c.path);
    }
    return { cutId, thumbnailPath: mainThumb, timestamp: best.timestamp, candidates: candidates.length };
  }

  return { cutId, thumbnailPath: null, candidates: 0 };
}

module.exports = {
  extractFrame,
  generateThumbnail,
  generateCutThumbnails,
  extractBestThumbnail,
};
