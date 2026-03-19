#!/usr/bin/env node
'use strict';

/**
 * subtitles.js — Smart subtitle overlay engine
 * Story: AV-4.2
 *
 * Burns subtitles into video using FFmpeg ASS filter.
 * Supports multiple styles (minimal, bold, karaoke, etc).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');
const { parseSRT, formatTimestamp } = require('./srt-parser');

const SUBTITLE_STYLES = {
  minimal: {
    fontName: 'Arial',
    fontSize: 24,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H80000000',
    outline: 2,
    alignment: 2, // bottom center
    marginV: 40,
  },
  bold: {
    fontName: 'Arial Black',
    fontSize: 32,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H000000FF',
    outline: 3,
    alignment: 2,
    marginV: 50,
    bold: 1,
  },
  karaoke: {
    fontName: 'Arial',
    fontSize: 28,
    primaryColor: '&H0000FFFF',
    outlineColor: '&H80000000',
    outline: 2,
    alignment: 2,
    marginV: 40,
  },
  subtitle: {
    fontName: 'Arial',
    fontSize: 22,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H80000000',
    outline: 1,
    alignment: 2,
    marginV: 30,
  },
};

function generateASS(segments, style, videoWidth, videoHeight) {
  const s = SUBTITLE_STYLES[style] || SUBTITLE_STYLES.minimal;

  let ass = '[Script Info]\n';
  ass += 'Title: Central Audiovisual Subtitles\n';
  ass += 'ScriptType: v4.00+\n';
  ass += `PlayResX: ${videoWidth}\n`;
  ass += `PlayResY: ${videoHeight}\n\n`;

  ass += '[V4+ Styles]\n';
  ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  ass += `Style: Default,${s.fontName},${s.fontSize},${s.primaryColor},&H000000FF,${s.outlineColor},&H80000000,${s.bold || 0},0,0,0,100,100,0,0,1,${s.outline},0,${s.alignment},10,10,${s.marginV},1\n\n`;

  ass += '[Events]\n';
  ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  for (const seg of segments) {
    const start = formatASSTime(seg.start);
    const end = formatASSTime(seg.end);
    const text = seg.text.replace(/\n/g, '\\N');
    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function burnSubtitles(videoPath, assPath, outputPath) {
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${videoPath}"`,
    '-vf', `"ass=${assPath.replace(/'/g, "'\\''")}"`,
    '-c:a', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 600000 });
  } catch (err) {
    throw new Error(`Failed to burn subtitles: ${err.message}`);
  }
}

function addSubtitlesToCut(projectId, cutId, style = 'minimal') {
  const projectDir = getProjectDir(projectId);
  const productionDir = path.join(projectDir, 'production');
  const analysisDir = path.join(projectDir, 'analysis');

  // Find assembled video
  const assembledPath = path.join(productionDir, `assembled-${cutId}.mp4`);
  if (!fs.existsSync(assembledPath)) {
    throw new Error(`Assembled video not found for ${cutId}. Run assembly first.`);
  }

  // Load transcription
  const srtPath = path.join(analysisDir, 'transcription.srt');
  if (!fs.existsSync(srtPath)) {
    throw new Error('Transcription SRT not found');
  }

  // Load cut info for time offset
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
  if (!cut) throw new Error(`Cut ${cutId} not found`);

  // Parse SRT and filter segments within cut range
  const allSegments = parseSRT(fs.readFileSync(srtPath, 'utf8'));
  const cutSegments = allSegments
    .filter(s => s.start >= cut.start && s.end <= cut.end)
    .map(s => ({
      ...s,
      start: s.start - cut.start, // offset to cut-relative time
      end: s.end - cut.start,
    }));

  if (cutSegments.length === 0) {
    console.log(`  No subtitle segments for ${cutId}, skipping.`);
    fs.copyFileSync(assembledPath, path.join(productionDir, `subtitled-${cutId}.mp4`));
    return { cutId, style, segments: 0 };
  }

  // Determine video dimensions from format
  const dims = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const [w, h] = dims[cut.format] || [1080, 1920];

  // Generate ASS file
  const assContent = generateASS(cutSegments, style, w, h);
  const assPath = path.join(productionDir, `subs-${cutId}.ass`);
  fs.writeFileSync(assPath, assContent);

  // Burn subtitles
  const outputPath = path.join(productionDir, `subtitled-${cutId}.mp4`);
  console.log(`  Burning ${cutSegments.length} subtitle segments (${style})...`);
  burnSubtitles(assembledPath, assPath, outputPath);

  // Cleanup ASS
  if (fs.existsSync(assPath)) fs.unlinkSync(assPath);

  return { cutId, style, segments: cutSegments.length, outputPath };
}

module.exports = {
  generateASS,
  formatASSTime,
  burnSubtitles,
  addSubtitlesToCut,
  SUBTITLE_STYLES,
};
