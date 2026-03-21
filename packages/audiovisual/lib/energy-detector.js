#!/usr/bin/env node
'use strict';

/**
 * energy-detector.js — Audio energy analysis for hook extraction
 * Story: AV-10
 *
 * Analyzes audio to find peak energy moments (loudest 5s window)
 * using FFmpeg volumedetect. Extracts a 5-second hook clip
 * from the highest-energy section of the video.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');

const HOOK_DURATION = 5; // seconds
const WINDOW_SIZE = 5;   // seconds per analysis window
const WINDOW_STEP = 2;   // step between windows for overlap

/**
 * Get total duration of a media file via ffprobe.
 */
function getMediaDuration(filePath) {
  const cmd = [
    'ffprobe', '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    `"${filePath}"`,
  ].join(' ');

  try {
    const output = execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    return parseFloat(output.toString().trim());
  } catch (err) {
    throw new Error(`Failed to get media duration: ${err.message}`);
  }
}

/**
 * Measure mean volume (RMS) for a specific time window using FFmpeg.
 * Returns mean_volume in dB (negative, closer to 0 = louder).
 */
function measureWindowVolume(filePath, startTime, duration) {
  const cmd = [
    'ffmpeg', '-y',
    '-ss', String(startTime),
    '-t', String(duration),
    '-i', `"${filePath}"`,
    '-af', 'volumedetect',
    '-f', 'null', '-',
  ].join(' ');

  try {
    // volumedetect outputs to stderr
    const result = execSync(cmd, { stdio: 'pipe', timeout: 60000 });
    const stderr = result.toString();
    return parseVolumeOutput(stderr);
  } catch (err) {
    // FFmpeg writes volumedetect to stderr even on "success"
    const stderr = err.stderr ? err.stderr.toString() : '';
    const parsed = parseVolumeOutput(stderr);
    if (parsed !== null) {
      return parsed;
    }
    // Window might be silent or too short — return very low volume
    return -91.0;
  }
}

/**
 * Parse FFmpeg volumedetect output to extract mean_volume.
 */
function parseVolumeOutput(output) {
  const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  if (meanMatch) {
    return parseFloat(meanMatch[1]);
  }
  return null;
}

/**
 * Analyze the entire audio in sliding windows and return energy data.
 * Each window gets an RMS volume measurement.
 */
function analyzeEnergyWindows(filePath, totalDuration) {
  const windows = [];
  const maxStart = totalDuration - WINDOW_SIZE;

  for (let start = 0; start <= maxStart; start += WINDOW_STEP) {
    const windowDuration = Math.min(WINDOW_SIZE, totalDuration - start);
    if (windowDuration < 2) break; // skip very short tail windows

    const meanVolume = measureWindowVolume(filePath, start, windowDuration);
    windows.push({
      start,
      end: start + windowDuration,
      duration: windowDuration,
      meanVolume,
    });
  }

  return windows;
}

/**
 * Find the peak energy window — the one with the highest mean volume.
 * Higher (closer to 0 dB) = louder = more energy.
 */
function findPeakWindow(windows) {
  if (windows.length === 0) {
    return null;
  }

  let peak = windows[0];
  for (const w of windows) {
    if (w.meanVolume > peak.meanVolume) {
      peak = w;
    }
  }

  return peak;
}

/**
 * Find top N peak energy windows, spaced at least minGap seconds apart.
 * Story AV-12 (Melhoria 2): Multiple hook candidates.
 */
function findTopPeaks(windows, count = 3, minGap = 15) {
  if (windows.length === 0) return [];

  const sorted = [...windows]
    .filter(w => w.meanVolume !== null)
    .sort((a, b) => b.meanVolume - a.meanVolume);

  const peaks = [];
  for (const w of sorted) {
    if (peaks.length >= count) break;
    // Ensure minimum gap between selected peaks
    const tooClose = peaks.some(p => Math.abs(p.start - w.start) < minGap);
    if (!tooClose) {
      peaks.push({ ...w, rank: peaks.length + 1 });
    }
  }

  return peaks;
}

/**
 * Extract a 5-second hook clip from the video at the given start time.
 */
function extractHookClip(videoPath, startTime, outputPath) {
  const cmd = [
    'ffmpeg', '-y',
    '-ss', String(startTime),
    '-i', `"${videoPath}"`,
    '-t', String(HOOK_DURATION),
    '-c', 'copy',
    '-avoid_negative_ts', '1',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120000 });
  } catch (err) {
    throw new Error(`Failed to extract hook clip at ${startTime}s: ${err.message}`);
  }
}

/**
 * Full energy detection pipeline for a project.
 * Analyzes audio, finds peak energy, extracts 5s hook.
 *
 * Returns { peakWindow, hookPath, windows, totalDuration }
 */
function detectEnergy(projectId) {
  const projectDir = getProjectDir(projectId);
  const sourceDir = path.join(projectDir, 'source');
  const productionDir = path.join(projectDir, 'production');

  // Find source video
  const sourceFiles = fs.readdirSync(sourceDir);
  const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!videoFile) {
    throw new Error(`No source video found in project ${projectId}`);
  }

  const videoPath = path.join(sourceDir, videoFile);
  const totalDuration = getMediaDuration(videoPath);

  if (totalDuration < HOOK_DURATION) {
    throw new Error(`Video too short (${totalDuration}s) for ${HOOK_DURATION}s hook extraction`);
  }

  console.log(`  Analyzing energy in ${Math.ceil(totalDuration / WINDOW_STEP)} windows...`);
  const windows = analyzeEnergyWindows(videoPath, totalDuration);
  const peakWindow = findPeakWindow(windows);

  if (!peakWindow) {
    throw new Error('Could not detect energy peak — no valid audio windows');
  }

  // Find top 3 peaks (AV-12 Melhoria 2)
  const topPeaks = findTopPeaks(windows, 3);

  console.log(`  Peak energy at ${peakWindow.start}s–${peakWindow.end}s (${peakWindow.meanVolume} dB)`);
  if (topPeaks.length > 1) {
    console.log(`  Top ${topPeaks.length} hooks: ${topPeaks.map(p => p.start + 's').join(', ')}`);
  }

  // Extract 5s hook from peak
  fs.mkdirSync(productionDir, { recursive: true });
  const hookPath = path.join(productionDir, 'hook.mp4');
  extractHookClip(videoPath, peakWindow.start, hookPath);

  // Extract alternative hooks
  const hookPaths = [hookPath];
  for (let i = 1; i < topPeaks.length; i++) {
    const altPath = path.join(productionDir, `hook-alt-${i + 1}.mp4`);
    extractHookClip(videoPath, topPeaks[i].start, altPath);
    hookPaths.push(altPath);
  }

  // Save energy analysis
  const analysisDir = path.join(projectDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  const energyData = {
    totalDuration,
    windowSize: WINDOW_SIZE,
    windowStep: WINDOW_STEP,
    hookDuration: HOOK_DURATION,
    peakWindow,
    topPeaks,
    windowCount: windows.length,
    windows,
    hookPath,
    hookPaths,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(analysisDir, 'energy.json'),
    JSON.stringify(energyData, null, 2)
  );

  console.log(`  Hook extracted: hook.mp4 (${HOOK_DURATION}s from ${peakWindow.start}s)`);

  return energyData;
}

/**
 * Load previously computed energy data for a project.
 */
function loadEnergyData(projectId) {
  const energyPath = path.join(getProjectDir(projectId), 'analysis', 'energy.json');
  if (!fs.existsSync(energyPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(energyPath, 'utf8'));
}

module.exports = {
  detectEnergy,
  loadEnergyData,
  analyzeEnergyWindows,
  findPeakWindow,
  findTopPeaks,
  extractHookClip,
  measureWindowVolume,
  parseVolumeOutput,
  getMediaDuration,
  HOOK_DURATION,
  WINDOW_SIZE,
  WINDOW_STEP,
};
