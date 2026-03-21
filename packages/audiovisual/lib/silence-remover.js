#!/usr/bin/env node
'use strict';

/**
 * silence-remover.js — Remove silent segments from video
 * Story: AV-12 (Melhoria 1)
 *
 * Uses FFmpeg silencedetect to find pauses >1.5s and removes them,
 * creating a tighter, more dynamic cut.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SILENCE_THRESHOLD = '-35dB';
const MIN_SILENCE_DURATION = 1.5; // seconds

/**
 * Detect silent segments in a video/audio file.
 * Returns array of { start, end, duration } for each silence.
 */
function detectSilence(filePath, options = {}) {
  const threshold = options.threshold || SILENCE_THRESHOLD;
  const minDuration = options.minDuration || MIN_SILENCE_DURATION;

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${filePath}"`,
    '-af', `silencedetect=noise=${threshold}:d=${minDuration}`,
    '-f', 'null', '-',
  ].join(' ');

  let stderr;
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
    stderr = '';
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
  }

  // Parse silencedetect output
  const silences = [];
  const startRegex = /silence_start:\s*([\d.]+)/g;
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  const starts = [];
  let match;
  while ((match = startRegex.exec(stderr)) !== null) {
    starts.push(parseFloat(match[1]));
  }

  let idx = 0;
  while ((match = endRegex.exec(stderr)) !== null) {
    const end = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const start = idx < starts.length ? starts[idx] : end - duration;
    silences.push({ start, end, duration });
    idx++;
  }

  return silences;
}

/**
 * Get non-silent segments (inverse of silence detection).
 * Returns array of { start, end } for speaking/active parts.
 */
function getSpeakingSegments(filePath, totalDuration, options = {}) {
  const silences = detectSilence(filePath, options);

  if (silences.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  const segments = [];
  let cursor = 0;

  for (const silence of silences) {
    if (silence.start > cursor + 0.1) {
      segments.push({ start: cursor, end: silence.start });
    }
    cursor = silence.end;
  }

  // Add remaining after last silence
  if (cursor < totalDuration - 0.1) {
    segments.push({ start: cursor, end: totalDuration });
  }

  return segments;
}

/**
 * Remove silence from a video file.
 * Creates a new video with only the speaking/active parts concatenated.
 */
function removeSilence(inputPath, outputPath, options = {}) {
  // Get total duration
  const durationCmd = [
    'ffprobe', '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    `"${inputPath}"`,
  ].join(' ');

  let totalDuration;
  try {
    totalDuration = parseFloat(execSync(durationCmd, { stdio: 'pipe', timeout: 30000 }).toString().trim());
  } catch (err) {
    throw new Error(`Failed to get duration: ${err.message}`);
  }

  const segments = getSpeakingSegments(inputPath, totalDuration, options);

  if (segments.length === 0) {
    // All silent — copy original
    fs.copyFileSync(inputPath, outputPath);
    return { removed: 0, segments: 0, originalDuration: totalDuration, newDuration: totalDuration };
  }

  if (segments.length === 1 && segments[0].start < 0.1 && Math.abs(segments[0].end - totalDuration) < 0.1) {
    // No significant silence — copy original
    fs.copyFileSync(inputPath, outputPath);
    return { removed: 0, segments: 1, originalDuration: totalDuration, newDuration: totalDuration };
  }

  // Build FFmpeg filter to select and concat non-silent segments
  const tmpDir = path.dirname(outputPath);
  const concatFile = path.join(tmpDir, 'silence-concat-tmp.txt');
  const segmentFiles = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segPath = path.join(tmpDir, `silence-seg-${i}.mp4`);
    const cmd = [
      'ffmpeg', '-y',
      '-ss', String(seg.start),
      '-i', `"${inputPath}"`,
      '-t', String(seg.end - seg.start),
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      `"${segPath}"`,
    ].join(' ');
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 120000 });
      segmentFiles.push(segPath);
    } catch {
      // Skip failed segments
    }
  }

  if (segmentFiles.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return { removed: 0, segments: 0, originalDuration: totalDuration, newDuration: totalDuration };
  }

  // Concatenate
  const content = segmentFiles.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, content);

  const concatCmd = [
    'ffmpeg', '-y',
    '-f', 'concat', '-safe', '0',
    '-i', `"${concatFile}"`,
    '-c', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(concatCmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to concat non-silent segments: ${err.message}`);
  } finally {
    // Cleanup
    if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
    for (const f of segmentFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  // Calculate new duration
  let newDuration;
  try {
    newDuration = parseFloat(execSync(durationCmd.replace(inputPath, outputPath), { stdio: 'pipe', timeout: 30000 }).toString().trim());
  } catch {
    newDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  }

  const removed = totalDuration - newDuration;
  console.log(`  Silence removed: ${removed.toFixed(1)}s (${segments.length} segments kept)`);

  return {
    removed: parseFloat(removed.toFixed(1)),
    segments: segments.length,
    originalDuration: parseFloat(totalDuration.toFixed(1)),
    newDuration: parseFloat(newDuration.toFixed(1)),
  };
}

module.exports = {
  detectSilence,
  getSpeakingSegments,
  removeSilence,
  SILENCE_THRESHOLD,
  MIN_SILENCE_DURATION,
};
