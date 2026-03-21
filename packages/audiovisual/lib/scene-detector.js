#!/usr/bin/env node
'use strict';

/**
 * scene-detector.js — Detect scene changes (fala vs. tela)
 * Story: AV-12 (Melhoria 5)
 *
 * Uses FFmpeg scene detection to classify segments as:
 * - "fala" (talking head / facecam)
 * - "tela" (screen recording / app)
 * - "transicao" (transition between scenes)
 */

const { execSync } = require('child_process');

const SCENE_THRESHOLD = 0.3; // 0-1, lower = more sensitive

/**
 * Detect scene changes in a video using FFmpeg.
 * Returns array of { timestamp, score } for each scene change.
 */
function detectSceneChanges(videoPath, options = {}) {
  const threshold = options.threshold || SCENE_THRESHOLD;

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${videoPath}"`,
    '-vf', `"select='gt(scene,${threshold})',showinfo"`,
    '-f', 'null', '-',
  ].join(' ');

  let stderr;
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
    stderr = '';
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
  }

  const changes = [];
  const regex = /pts_time:([\d.]+).*scene_score=([\d.]+)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    changes.push({
      timestamp: parseFloat(match[1]),
      score: parseFloat(match[2]),
    });
  }

  return changes;
}

/**
 * Classify video segments as "fala" or "tela" based on scene stability.
 * Stable segments (few scene changes) = facecam talking.
 * Frequent changes = screen recording / app navigation.
 */
function classifyScenes(videoPath, totalDuration, options = {}) {
  const changes = detectSceneChanges(videoPath, options);
  const windowSize = options.windowSize || 10; // analyze in 10s windows

  const scenes = [];
  for (let start = 0; start < totalDuration; start += windowSize) {
    const end = Math.min(start + windowSize, totalDuration);
    const windowChanges = changes.filter(c => c.timestamp >= start && c.timestamp < end);
    const changeRate = windowChanges.length / (end - start);

    // High change rate = screen/app, low = talking head
    const type = changeRate > 0.5 ? 'tela' : 'fala';

    scenes.push({
      start,
      end,
      type,
      changeRate: parseFloat(changeRate.toFixed(2)),
      sceneChanges: windowChanges.length,
    });
  }

  // Merge adjacent segments of same type
  const merged = [];
  for (const scene of scenes) {
    const last = merged[merged.length - 1];
    if (last && last.type === scene.type) {
      last.end = scene.end;
      last.sceneChanges += scene.sceneChanges;
      last.changeRate = parseFloat((last.sceneChanges / (last.end - last.start)).toFixed(2));
    } else {
      merged.push({ ...scene });
    }
  }

  return merged;
}

module.exports = {
  detectSceneChanges,
  classifyScenes,
  SCENE_THRESHOLD,
};
