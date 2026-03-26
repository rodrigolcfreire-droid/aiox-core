#!/usr/bin/env node
'use strict';

/**
 * subtitles.js — Animated subtitle engine (Reels/TikTok style)
 * Story: AV-15
 *
 * Generates word-by-word animated ASS subtitles with 4 visual presets.
 * Burns into video via FFmpeg. Supports vertical/horizontal/square formats.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');
const { parseSRT, formatTimestamp } = require('./srt-parser');

// ── Keyword Detection ──────────────────────────────────────

const HIGHLIGHT_PATTERNS = [
  // Numbers and money
  /^\d+[%kKmM]?$/,
  /^R?\$\d/,
  // Action verbs (PT-BR)
  /^(agora|nunca|sempre|pare|faca|veja|olha|compre|aprenda|descubra|imagina|acredito|precisa|quero|vai|vem|siga)$/i,
  // Intensifiers
  /^(muito|demais|incrivel|absurdo|impossivel|melhor|pior|maior|menor|unico|primeiro|ultimo|gratis|novo|secreto|proibido|urgente|importante|exclusivo)$/i,
  // English common in BR content
  /^(free|top|hack|dica|boom|wow|sim|nao|yes|no|stop|go|real|fake)$/i,
];

function isHighlightWord(word) {
  const clean = word.replace(/[.,!?;:'"]/g, '');
  return HIGHLIGHT_PATTERNS.some(p => p.test(clean));
}

// ── Preset Definitions ─────────────────────────────────────

const PRESETS = {
  viral: {
    fontName: 'Arial Black',
    sizeFactor: 13,       // videoWidth / sizeFactor = fontSize
    primaryColor: '&H00FFFFFF',
    highlightColor: '&H0000FFFF', // yellow
    outlineColor: '&H00000000',
    outline: 4,
    shadow: 2,
    bold: 1,
    marginVFactor: 0.15,  // from bottom
    // Animation: scale up from 80% with fade
    animIn: '{\\fad(120,0)\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)}',
    animHighlight: '{\\fad(100,0)\\fscx90\\fscy90\\t(0,100,\\fscx110\\fscy110\\t(100,200,\\fscx100\\fscy100))}',
  },
  clean: {
    fontName: 'Helvetica Neue',
    sizeFactor: 15,
    primaryColor: '&H00FFFFFF',
    highlightColor: '&H0078D4FF', // blue
    outlineColor: '&H80000000',
    outline: 2,
    shadow: 1,
    bold: 1,
    marginVFactor: 0.12,
    animIn: '{\\fad(150,0)}',
    animHighlight: '{\\fad(100,0)\\c&H0078D4&}',
  },
  impacto: {
    fontName: 'Impact',
    sizeFactor: 11,
    primaryColor: '&H00FFFFFF',
    highlightColor: '&H004040FF', // red-orange
    outlineColor: '&H00000000',
    outline: 5,
    shadow: 3,
    bold: 1,
    marginVFactor: 0.18,
    // Slam effect: start big, shrink to normal
    animIn: '{\\fad(80,0)\\fscx130\\fscy130\\t(0,100,\\fscx100\\fscy100)}',
    animHighlight: '{\\fad(60,0)\\fscx150\\fscy150\\t(0,80,\\fscx105\\fscy105)\\c&H004040FF&}',
  },
  premium: {
    fontName: 'Georgia',
    sizeFactor: 14,
    primaryColor: '&H00F0E6D2',  // warm white
    highlightColor: '&H0000D4FF', // gold
    outlineColor: '&H40000000',
    outline: 3,
    shadow: 2,
    bold: 0,
    marginVFactor: 0.14,
    animIn: '{\\fad(200,50)}',
    animHighlight: '{\\fad(150,0)\\c&H0000D4FF&}',
  },
};

// ── ASS Time Formatter ─────────────────────────────────────

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Word Grouping (2-4 words per block) ────────────────────

function groupWordsIntoBlocks(words, maxPerBlock = 3) {
  const blocks = [];
  let current = [];

  for (const word of words) {
    current.push(word);
    if (current.length >= maxPerBlock) {
      blocks.push([...current]);
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

// ── Main ASS Generator ─────────────────────────────────────

function generateAnimatedASS(transcription, cutStart, cutEnd, videoWidth, videoHeight, presetName = 'viral') {
  const preset = PRESETS[presetName] || PRESETS.viral;
  const fontSize = Math.round(videoWidth / preset.sizeFactor);
  const highlightSize = Math.round(fontSize * 1.15);
  const marginV = Math.round(videoHeight * preset.marginVFactor);

  // Alignment: vertical videos use center (5), horizontal use bottom-center (2)
  const isVertical = videoHeight > videoWidth;
  const alignment = isVertical ? 5 : 2;
  const actualMarginV = isVertical ? Math.round(videoHeight * 0.25) : marginV;

  let ass = '[Script Info]\n';
  ass += 'Title: AIOX Animated Subtitles\n';
  ass += 'ScriptType: v4.00+\n';
  ass += `PlayResX: ${videoWidth}\n`;
  ass += `PlayResY: ${videoHeight}\n\n`;

  ass += '[V4+ Styles]\n';
  ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  ass += `Style: Default,${preset.fontName},${fontSize},${preset.primaryColor},&H000000FF,${preset.outlineColor},&H80000000,${preset.bold},0,0,0,100,100,2,0,1,${preset.outline},${preset.shadow},${alignment},20,20,${actualMarginV},1\n`;
  ass += `Style: Highlight,${preset.fontName},${highlightSize},${preset.highlightColor},&H000000FF,${preset.outlineColor},&H80000000,1,0,0,0,100,100,2,0,1,${preset.outline + 1},${preset.shadow},${alignment},20,20,${actualMarginV},1\n\n`;

  ass += '[Events]\n';
  ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  // Get segments within cut range
  const segments = (transcription.segments || [])
    .filter(s => s.start >= cutStart && s.end <= cutEnd);

  for (const seg of segments) {
    // Use word-level timestamps if available, else estimate from segment
    const words = seg.words || seg.text.split(/\s+/).map((w, i, arr) => {
      const segDur = seg.end - seg.start;
      const wordDur = segDur / arr.length;
      return { word: w, start: seg.start + i * wordDur, end: seg.start + (i + 1) * wordDur };
    });

    // Group into blocks of 2-4 words
    const blocks = groupWordsIntoBlocks(words, 3);

    for (const block of blocks) {
      const blockStart = (block[0].start || block[0].start) - cutStart;
      const blockEnd = (block[block.length - 1].end || block[block.length - 1].end) - cutStart;

      if (blockStart < 0 || blockEnd < 0) continue;

      // Build text with per-word animation
      const textParts = block.map(w => {
        const text = (w.word || w.text || '').toUpperCase();
        const isHL = isHighlightWord(w.word || w.text || '');
        if (isHL) {
          return preset.animHighlight + '{\\rHighlight}' + text + '{\\rDefault}';
        }
        return preset.animIn + text;
      });

      const start = formatASSTime(Math.max(blockStart, 0));
      const end = formatASSTime(blockEnd);
      ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${textParts.join(' ')}\n`;
    }
  }

  return ass;
}

// ── Legacy ASS Generator (backward compat) ─────────────────

function generateASS(segments, style, videoWidth, videoHeight) {
  const LEGACY_STYLES = {
    minimal: { fontName: 'Arial', fontSize: 24, primaryColor: '&H00FFFFFF', outlineColor: '&H80000000', outline: 2, alignment: 2, marginV: 40 },
    bold: { fontName: 'Arial Black', fontSize: 32, primaryColor: '&H00FFFFFF', outlineColor: '&H000000FF', outline: 3, alignment: 2, marginV: 50, bold: 1 },
    karaoke: { fontName: 'Arial', fontSize: 28, primaryColor: '&H0000FFFF', outlineColor: '&H80000000', outline: 2, alignment: 2, marginV: 40 },
    subtitle: { fontName: 'Arial', fontSize: 22, primaryColor: '&H00FFFFFF', outlineColor: '&H80000000', outline: 1, alignment: 2, marginV: 30 },
  };
  const s = LEGACY_STYLES[style] || LEGACY_STYLES.minimal;

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

// ── Burn Subtitles ─────────────────────────────────────────

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

// ── Add Subtitles to Cut ───────────────────────────────────

function addSubtitlesToCut(projectId, cutId, style = 'viral') {
  const projectDir = getProjectDir(projectId);
  const productionDir = path.join(projectDir, 'production');
  const analysisDir = path.join(projectDir, 'analysis');

  // Find assembled video
  const assembledPath = path.join(productionDir, `assembled-${cutId}.mp4`);
  if (!fs.existsSync(assembledPath)) {
    throw new Error(`Assembled video not found for ${cutId}. Run assembly first.`);
  }

  // Load transcription (JSON with word timestamps preferred, fallback to SRT)
  let transcription;
  const jsonPath = path.join(analysisDir, 'transcription.json');
  const srtPath = path.join(analysisDir, 'transcription.srt');

  if (fs.existsSync(jsonPath)) {
    transcription = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } else if (fs.existsSync(srtPath)) {
    const segments = parseSRT(fs.readFileSync(srtPath, 'utf8'));
    transcription = { segments };
  } else {
    throw new Error('Transcription not found (need .json or .srt)');
  }

  // Load cut info for time range
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
  if (!cut) throw new Error(`Cut ${cutId} not found`);

  // Determine video dimensions
  const dims = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const [w, h] = dims[cut.format] || [1080, 1920];

  // Use new animated preset if it exists, else legacy
  const useAnimated = PRESETS[style];
  const assContent = useAnimated
    ? generateAnimatedASS(transcription, cut.start, cut.end, w, h, style)
    : generateASS(
        (transcription.segments || [])
          .filter(s => s.start >= cut.start && s.end <= cut.end)
          .map(s => ({ ...s, start: s.start - cut.start, end: s.end - cut.start })),
        style, w, h
      );

  const assPath = path.join(productionDir, `subs-${cutId}.ass`);
  fs.writeFileSync(assPath, assContent);

  // Burn subtitles
  const outputPath = path.join(productionDir, `subtitled-${cutId}.mp4`);
  const segCount = (transcription.segments || []).filter(s => s.start >= cut.start && s.end <= cut.end).length;
  console.log(`  Burning ${segCount} segments with "${style}" preset (animated)...`);
  burnSubtitles(assembledPath, assPath, outputPath);

  // Cleanup ASS
  if (fs.existsSync(assPath)) fs.unlinkSync(assPath);

  return { cutId, style, segments: segCount, outputPath };
}

// ── Backward-compat alias ──────────────────────────────────

function generateWordByWordASS(transcription, cutStart, cutEnd, videoWidth, videoHeight) {
  return generateAnimatedASS(transcription, cutStart, cutEnd, videoWidth, videoHeight, 'viral');
}

module.exports = {
  generateASS,
  generateAnimatedASS,
  generateWordByWordASS,
  formatASSTime,
  burnSubtitles,
  addSubtitlesToCut,
  isHighlightWord,
  groupWordsIntoBlocks,
  PRESETS,
  SUBTITLE_STYLES: Object.keys(PRESETS).reduce((acc, k) => { acc[k] = PRESETS[k]; return acc; }, {}),
};
