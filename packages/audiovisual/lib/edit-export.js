#!/usr/bin/env node
'use strict';

/**
 * edit-export.js — Export engine for non-destructive edits
 * Story: EG-2
 *
 * Reads an edit JSON, applies trim + subtitle burn with preset styling,
 * and produces a final .mp4. Single FFmpeg pipeline where possible.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getEdit, updateEdit } = require(path.resolve(__dirname, 'edit-store'));
const { generateAnimatedASS, burnSubtitles } = require(path.resolve(__dirname, 'subtitles'));
const { AV_DIR } = require(path.resolve(__dirname, 'constants'));

const EXPORTS_DIR = path.join(AV_DIR, 'exports');

const QUALITY_PROFILES = {
  low: {
    scale: 'scale=-2:480',
    preset: 'ultrafast',
    crf: '32',
    audioBitrate: '96k',
  },
  high: {
    scale: null,
    preset: 'medium',
    crf: '18',
    audioBitrate: '192k',
  },
};

/**
 * Resolve the source video path for an edit.
 * Handles both absolute paths and cutId references.
 *
 * @param {Object} edit - The edit object
 * @returns {string} Absolute path to the source video file
 */
function resolveSourceVideo(edit) {
  const source = edit.sourceVideo;

  // If it's an absolute path, use directly
  if (path.isAbsolute(source) && fs.existsSync(source)) {
    return source;
  }

  // If it looks like a cutId (cut_NNN), resolve via project
  if (/^cut_\d+/.test(source) && edit.projectId && edit.projectId !== 'standalone') {
    const { PROJECTS_DIR } = require(path.resolve(__dirname, 'constants'));
    const projectDir = path.join(PROJECTS_DIR, edit.projectId);
    const sourceDir = path.join(projectDir, 'source');

    if (fs.existsSync(sourceDir)) {
      const files = fs.readdirSync(sourceDir);
      const video = files.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
      if (video) return path.join(sourceDir, video);
    }
  }

  // Try as relative path from CWD
  const resolved = path.resolve(source);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  throw new Error(`Source video not found: ${source}`);
}

/**
 * Build an ASS subtitle file from the edit's transcript + preset.
 * Converts the edit transcript format to the transcription format expected by subtitles.js.
 *
 * @param {Object} edit - The edit object with transcript array
 * @param {Object} presetStyle - FFmpeg-compatible style from getPresetStyle()
 * @param {number} videoWidth - Video width in pixels
 * @param {number} videoHeight - Video height in pixels
 * @param {number} trimIn - Trim start time
 * @param {number} trimOut - Trim end time
 * @returns {string} ASS file content
 */
function buildSubtitleASS(edit, presetStyle, videoWidth, videoHeight, trimIn, trimOut) {
  const transcript = edit.transcript || [];
  if (transcript.length === 0) return null;

  // Convert edit transcript [{t, text, edited}] to transcription format [{start, end, text}]
  const segments = [];
  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    const start = seg.t || 0;
    const end = (i + 1 < transcript.length) ? transcript[i + 1].t : (trimOut || start + 3);

    // Only include segments within trim range
    if (end > trimIn && start < trimOut) {
      segments.push({
        start: Math.max(start, trimIn),
        end: Math.min(end, trimOut),
        text: seg.text || '',
      });
    }
  }

  if (segments.length === 0) return null;

  // Build transcription object for generateAnimatedASS
  const transcription = { segments };

  // Use the animated ASS generator from subtitles.js
  // Pass trimIn/trimOut as cut boundaries
  return generateAnimatedASS(transcription, trimIn, trimOut, videoWidth, videoHeight, 'viral');
}

/**
 * Get video dimensions via ffprobe.
 *
 * @param {string} videoPath - Path to video file
 * @returns {{ width: number, height: number }}
 */
function getVideoDimensions(videoPath) {
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`;
    const output = execSync(cmd, { stdio: 'pipe', timeout: 30000 }).toString().trim();
    const [w, h] = output.split(',').map(Number);
    return { width: w || 1080, height: h || 1920 };
  } catch {
    return { width: 1080, height: 1920 };
  }
}

/**
 * Get video duration via ffprobe.
 *
 * @param {string} videoPath - Path to video file
 * @returns {number} Duration in seconds
 */
function getVideoDuration(videoPath) {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const output = execSync(cmd, { stdio: 'pipe', timeout: 30000 }).toString().trim();
    return parseFloat(output) || 0;
  } catch {
    return 0;
  }
}

/**
 * Export an edit to a final .mp4 file.
 *
 * Pipeline: trim source -> burn subtitles with preset -> output .mp4
 *
 * @param {string} editId - The edit UUID
 * @param {Object} [options] - Export options
 * @param {string} [options.quality='high'] - Quality profile: 'low' (480p preview) or 'high' (full quality)
 * @param {Function} [options.onProgress] - Progress callback: (stage, percent) => void
 * @returns {Object} Export result with outputPath
 */
function exportEdit(editId, options = {}) {
  const quality = options.quality || 'high';
  const onProgress = options.onProgress || (() => {});

  if (!QUALITY_PROFILES[quality]) {
    throw new Error(`Invalid quality: "${quality}". Must be "low" or "high".`);
  }

  const profile = QUALITY_PROFILES[quality];

  // 1. Load edit
  onProgress('loading', 0);
  const edit = getEdit(editId);

  if (edit.status === 'exported') {
    const existingPath = path.join(EXPORTS_DIR, `${editId}.mp4`);
    if (fs.existsSync(existingPath)) {
      return { editId, outputPath: existingPath, status: 'already-exported' };
    }
  }

  // 2. Resolve source video
  onProgress('resolving', 10);
  const videoPath = resolveSourceVideo(edit);

  // 3. Get trim points
  const duration = getVideoDuration(videoPath);
  const trimIn = edit.trim && edit.trim.in !== undefined ? edit.trim.in : 0;
  const trimOut = edit.trim && edit.trim.out !== null ? edit.trim.out : duration;

  if (trimOut <= trimIn) {
    throw new Error(`Invalid trim: in=${trimIn}, out=${trimOut}. Out must be greater than in.`);
  }

  const trimDuration = trimOut - trimIn;

  // 4. Ensure exports directory
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const outputPath = path.join(EXPORTS_DIR, `${editId}.mp4`);
  const tempDir = path.join(EXPORTS_DIR, `.tmp-${editId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 5. Trim source video
    onProgress('trimming', 20);
    const trimmedPath = path.join(tempDir, 'trimmed.mp4');

    const trimArgs = [
      'ffmpeg', '-y',
      '-ss', String(trimIn),
      '-i', `"${videoPath}"`,
      '-t', String(trimDuration),
      '-c:v', 'libx264',
      '-preset', profile.preset,
      '-crf', profile.crf,
      '-c:a', 'aac', '-b:a', profile.audioBitrate,
    ];

    if (profile.scale) {
      trimArgs.push('-vf', `"${profile.scale}"`);
    }

    trimArgs.push('-movflags', '+faststart', `"${trimmedPath}"`);

    execSync(trimArgs.join(' '), { stdio: 'pipe', timeout: 600000 });

    // 6. Burn subtitles if preset is set and transcript exists
    onProgress('subtitles', 50);
    let finalInput = trimmedPath;

    if (edit.presetId && edit.transcript && edit.transcript.length > 0) {
      try {
        const dims = getVideoDimensions(trimmedPath);
        const assContent = buildSubtitleASS(edit, null, dims.width, dims.height, trimIn, trimOut);

        if (assContent) {
          const assPath = path.join(tempDir, 'subtitles.ass');
          fs.writeFileSync(assPath, assContent);

          const subtitledPath = path.join(tempDir, 'subtitled.mp4');
          burnSubtitles(trimmedPath, assPath, subtitledPath);

          if (fs.existsSync(subtitledPath)) {
            finalInput = subtitledPath;
          }
        }
      } catch (err) {
        // Non-fatal: export without subtitles
        console.log(`  Warning: Subtitle burn failed (${err.message}). Exporting without subtitles.`);
      }
    }

    // 7. Move final output
    onProgress('finalizing', 90);
    fs.copyFileSync(finalInput, outputPath);

    // 8. Update edit status
    updateEdit(editId, { status: 'exported' });
    onProgress('done', 100);

    return {
      editId,
      outputPath,
      quality,
      duration: trimDuration,
      hasSubtitles: finalInput !== trimmedPath,
      presetId: edit.presetId,
    };
  } finally {
    // Cleanup temp directory
    try {
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tempDir, f));
      }
      fs.rmdirSync(tempDir);
    } catch {
      // Best-effort cleanup
    }
  }
}

module.exports = {
  exportEdit,
  resolveSourceVideo,
  getVideoDimensions,
  getVideoDuration,
  EXPORTS_DIR,
  QUALITY_PROFILES,
};
