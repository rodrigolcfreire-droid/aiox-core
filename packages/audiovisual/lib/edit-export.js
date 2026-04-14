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
const subtitlePresets = require(path.resolve(__dirname, 'subtitle-presets'));
const { AV_DIR } = require(path.resolve(__dirname, 'constants'));

function hexToASS(hex) {
  if (!hex || typeof hex !== 'string') return '&H00FFFFFF';
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase();
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`;
}

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const DEFAULT_EXPORT_PRESET = {
  id: '__default__',
  style: {
    font: 'Arial Black', size: 56, color: '#FFFFFF',
    strokeColor: '#000000', strokeWidth: 4, weight: '900',
    position: 'center-bottom', uppercase: false,
  },
  highlight: { mode: 'none' },
};

function buildCustomASS(edit, videoWidth, videoHeight, trimIn, trimOut) {
  const transcript = edit.transcript || [];
  if (transcript.length === 0) return null;

  let preset = DEFAULT_EXPORT_PRESET;
  if (edit.presetId) {
    try {
      preset = subtitlePresets.getPreset(edit.presetId);
    } catch {
      preset = DEFAULT_EXPORT_PRESET;
    }
  }

  const style = Object.assign({}, preset.style, edit.styleOverrides || {});
  const highlight = preset.highlight || { mode: 'none' };

  const refHeight = videoHeight >= videoWidth ? 1920 : 1080;
  const sizeScale = videoHeight / refHeight;
  const fontSize = Math.round((style.size || 56) * sizeScale);
  const outline = Math.max(0, Math.round((style.strokeWidth || 0) * sizeScale));
  const shadowDepth = style.shadow
    ? Math.max(1, Math.round(((style.shadowBlur || 0) + Math.abs(style.shadowX || 0) + Math.abs(style.shadowY || 0)) / 3 * sizeScale))
    : 0;

  const posMap = { 'top': 8, 'center-top': 8, 'center': 5, 'center-bottom': 2, 'bottom': 2 };
  const alignment = posMap[style.position] || 2;
  const marginV = style.position === 'top' || style.position === 'center-top'
    ? Math.round(videoHeight * 0.1)
    : style.position === 'center'
      ? 0
      : Math.round(videoHeight * 0.12);

  const primary = hexToASS(style.color || '#FFFFFF');
  const outlineColor = hexToASS(style.strokeColor || '#000000');
  // ASS BackColour is used both for shadow and for opaque-box background (BorderStyle=3).
  // Priority: bgEnabled (user override) > shadow > default.
  let borderStyle = 1;
  let backColourTag = '&H80000000';
  if (style.bgEnabled && style.bgColor) {
    borderStyle = 3;
    const alphaPct = style.bgOpacity != null ? style.bgOpacity : 60;
    const alphaHex = Math.round((100 - alphaPct) * 255 / 100).toString(16).padStart(2, '0').toUpperCase();
    const clean = (style.bgColor || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase();
    const r = clean.slice(0, 2), g = clean.slice(2, 4), b = clean.slice(4, 6);
    backColourTag = '&H' + alphaHex + b + g + r;
  } else if (style.shadow) {
    backColourTag = hexToASS(style.shadowColor || '#000000');
  }
  const shadowColor = backColourTag;
  const highlightColor = hexToASS(highlight.color || style.color || '#FFD700');
  const bold = (parseInt(style.weight, 10) || 400) >= 600 ? 1 : 0;
  const fontName = style.font || 'Arial Black';

  let ass = '[Script Info]\n';
  ass += 'Title: AIOX Edit Subtitles\n';
  ass += 'ScriptType: v4.00+\n';
  ass += `PlayResX: ${videoWidth}\n`;
  ass += `PlayResY: ${videoHeight}\n\n`;
  ass += '[V4+ Styles]\n';
  ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  const italic = style.italic ? 1 : 0;
  ass += `Style: Default,${fontName},${fontSize},${primary},&H000000FF,${outlineColor},${shadowColor},${bold},${italic},0,0,100,100,0,0,${borderStyle},${outline},${shadowDepth},${alignment},40,40,${marginV},1\n`;
  ass += `Style: Highlight,${fontName},${Math.round(fontSize * 1.1)},${highlightColor},&H000000FF,${outlineColor},${shadowColor},1,${italic},0,0,100,100,0,0,1,${outline + 1},${shadowDepth},${alignment},40,40,${marginV},1\n\n`;
  ass += '[Events]\n';
  ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  // Free position override via \pos() — overrides alignment/margin
  const posTag = (style.posX != null && style.posY != null)
    ? `{\\pos(${Math.round(videoWidth * style.posX / 100)},${Math.round(videoHeight * style.posY / 100)})}`
    : '';

  const wpcRaw = style.wordsPerCaption;
  const wpc = wpcRaw === undefined || wpcRaw === '' || wpcRaw === null ? 0 : parseInt(wpcRaw, 10);
  const chunkSize = wpc > 0 ? wpc : 0; // 0 = uma legenda por fala completa
  const toCase = t => (style.uppercase ? t.toUpperCase() : t);
  const clean = t => t.replace(/[\{\}]/g, '');

  const durMs = Math.max(Math.round((style.animDuration || 0.3) * 1000), 50);
  const animInTag = (name => {
    switch (name) {
      case 'fade':
      case 'typewriter': return `{\\fad(${durMs},0)}`;
      case 'pop': return `{\\fscx80\\fscy80\\t(0,${durMs},\\fscx100\\fscy100)\\fad(${Math.min(durMs,200)},0)}`;
      case 'zoom': return `{\\fscx180\\fscy180\\t(0,${durMs},\\fscx100\\fscy100)\\fad(${Math.min(durMs,200)},0)}`;
      case 'bounce': return `{\\fscx40\\fscy40\\t(0,${Math.round(durMs*0.6)},\\fscx115\\fscy115)\\t(${Math.round(durMs*0.6)},${durMs},\\fscx100\\fscy100)\\fad(${Math.min(durMs,200)},0)}`;
      case 'tiktok': return `{\\fscx40\\fscy40\\frz-5\\t(0,${Math.round(durMs*0.6)},\\fscx120\\fscy120\\frz2)\\t(${Math.round(durMs*0.6)},${durMs},\\fscx100\\fscy100\\frz0)\\fad(${Math.min(durMs,180)},0)}`;
      case 'rotate': return `{\\frz-180\\fscx30\\fscy30\\t(0,${durMs},\\frz0\\fscx100\\fscy100)\\fad(${Math.min(durMs,200)},0)}`;
      case 'flip': return `{\\fscx0\\t(0,${durMs},\\fscx100)\\fad(${Math.min(durMs,200)},0)}`;
      case 'glitch': return `{\\fad(${Math.min(durMs,100)},0)}`;
      case 'shake':
      case 'wave':
      case 'pulse':
      case 'slide-up':
      case 'slide-down':
      case 'slide-left':
      case 'slide-right': return `{\\fad(${durMs},0)}`;
      default: return `{\\fad(120,120)}`;
    }
  })(style.animIn || '');
  const outMs = Math.max(Math.round((style.animDuration || 0.3) * 1000), 50);
  const animOutTag = (name => {
    if (!name) return '';
    if (name === 'fade') return `{\\fad(0,${outMs})}`;
    if (name === 'pop') return `{\\t(\\fscx120\\fscy120)}`;
    return '';
  })(style.animOut || '');

  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    const segStart = seg.t || 0;
    const segEnd = (i + 1 < transcript.length) ? transcript[i + 1].t : (trimOut || segStart + 3);
    if (segEnd <= trimIn || segStart >= trimOut) continue;

    const text = (seg.text || '').trim();
    if (!text) continue;

    if (chunkSize === 0) {
      const dStart = Math.max(segStart - trimIn, 0);
      const dEnd = Math.min(segEnd - trimIn, trimOut - trimIn);
      if (dEnd <= 0) continue;
      ass += `Dialogue: 0,${formatASSTime(dStart)},${formatASSTime(dEnd)},Default,,0,0,0,,${posTag}${animInTag}${animOutTag}${toCase(clean(text))}\n`;
    } else {
      const words = text.split(/\s+/).filter(Boolean);
      const numChunks = Math.max(Math.ceil(words.length / chunkSize), 1);
      const duration = Math.max(segEnd - segStart, 0.1);
      const perChunk = duration / numChunks;
      for (let c = 0; c < numChunks; c++) {
        const cStart = Math.max(segStart + c * perChunk - trimIn, 0);
        const cEnd = Math.min(segStart + (c + 1) * perChunk - trimIn, trimOut - trimIn);
        if (cEnd <= 0) continue;
        const chunkText = toCase(clean(words.slice(c * chunkSize, (c + 1) * chunkSize).join(' ')));
        ass += `Dialogue: 0,${formatASSTime(cStart)},${formatASSTime(cEnd)},Default,,0,0,0,,${posTag}${animInTag}${animOutTag}${chunkText}\n`;
      }
    }
  }

  return ass;
}

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

  // Prefer the frontend preset (subtitle-presets.js) merged with styleOverrides.
  try {
    const custom = buildCustomASS(edit, videoWidth, videoHeight, trimIn, trimOut);
    if (custom) return custom;
  } catch (err) {
    console.log(`  Warning: custom ASS build failed (${err.message}). Falling back to legacy viral preset.`);
  }

  // Legacy fallback: generic 'viral' ASS preset.
  const segments = [];
  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    const start = seg.t || 0;
    const end = (i + 1 < transcript.length) ? transcript[i + 1].t : (trimOut || start + 3);
    if (end > trimIn && start < trimOut) {
      segments.push({
        start: Math.max(start, trimIn),
        end: Math.min(end, trimOut),
        text: seg.text || '',
      });
    }
  }
  if (segments.length === 0) return null;
  return generateAnimatedASS({ segments }, trimIn, trimOut, videoWidth, videoHeight, 'viral');
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

    if (edit.transcript && edit.transcript.length > 0) {
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
