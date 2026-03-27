#!/usr/bin/env node
'use strict';

/**
 * hook-headline.js — Auto-generated hook headlines for viral cuts
 * Story: AV-16
 *
 * Analyzes cut content and generates a curiosity-driven headline
 * that appears in the first 3-5 seconds. Works without LLM using
 * pattern matching on transcription + engagement heuristics.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');
const { formatASSTime } = require('./subtitles');

// ── Headline Templates (curiosity/retention patterns) ──────

const TEMPLATES = {
  curiosidade: [
    'Voce nao vai acreditar nisso...',
    'Ninguem te conta isso',
    'Olha o que aconteceu',
    'Isso muda tudo',
    'Presta atencao nisso',
    'Voce precisa ver isso',
  ],
  resultado: [
    '{value} na sua conta',
    'O resultado foi esse',
    'Olha o que deu',
    'Foi isso que aconteceu',
    'O final surpreende',
  ],
  emocao: [
    'Foi aqui que tudo mudou',
    'Esse momento...',
    'Olha a reacao',
    'Nao esperava isso',
  ],
  controversia: [
    'Concordam comigo?',
    'Isso e real?',
    'Serio isso?',
    'Alguem explica',
  ],
  acao: [
    'Olha isso ate o final',
    'Fica ate o final',
    'Espera o melhor',
    'Vem comigo',
  ],
};

// ── Headline Generation from Transcription ─────────────────

const HOOK_WORDS = {
  curiosidade: /\b(segredo|verdade|ninguem|incrivel|absurdo|impressionante|chocante|revelar|descobrir)\b/i,
  resultado: /\b(resultado|ganhou|perdeu|lucro|prejuizo|R\$|mil|reais|dinheiro|conta|pix)\b/i,
  emocao: /\b(chorar|rir|medo|amor|odio|raiva|feliz|triste|emocion|sentir)\b/i,
  controversia: /\b(errado|mentira|golpe|fake|problema|perigo|cuidado|alerta)\b/i,
  acao: /\b(agora|rapido|urgente|hoje|ja|bora|vamos|corre|aproveita)\b/i,
};

/**
 * Analyze the first segment of a cut and pick the best headline.
 */
function generateHeadline(cut, transcription) {
  const segments = (transcription.segments || [])
    .filter(s => s.start >= cut.start && s.end <= cut.end);

  if (segments.length === 0) return null;

  // Get first 3 sentences
  const firstText = segments.slice(0, 3).map(s => s.text).join(' ');

  // Check for LLM-generated viral title first
  if (cut.viralTitle) {
    return { text: cut.viralTitle, type: 'llm', source: 'viral-title' };
  }

  // Detect hook type from content
  let bestType = 'curiosidade';
  let bestScore = 0;

  for (const [type, pattern] of Object.entries(HOOK_WORDS)) {
    const matches = (firstText.match(new RegExp(pattern, 'gi')) || []).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestType = type;
    }
  }

  // Extract a key phrase from the transcript (strongest opening line)
  const firstSentence = segments[0].text.trim();
  const isStrongOpening = firstSentence.length < 60 && (
    firstSentence.includes('!') ||
    firstSentence.includes('?') ||
    /^[A-Z]/.test(firstSentence) ||
    bestScore > 0
  );

  // Use transcript phrase if it's strong enough, else use template
  let headline;
  if (isStrongOpening && firstSentence.length > 5) {
    headline = firstSentence.toUpperCase();
  } else {
    // Pick a random template for the detected type
    const templates = TEMPLATES[bestType] || TEMPLATES.curiosidade;
    const idx = Math.abs(hashCode(cut.id)) % templates.length;
    headline = templates[idx];

    // Fill in values if template has placeholders
    if (headline.includes('{value}')) {
      const moneyMatch = firstText.match(/R?\$?\s*\d+[\d.,]*/);
      headline = headline.replace('{value}', moneyMatch ? moneyMatch[0] : 'Muito dinheiro');
    }
  }

  return {
    text: headline,
    type: bestType,
    source: isStrongOpening ? 'transcript' : 'template',
    duration: 4, // show for 4 seconds
  };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ── Burn Headline into Video ───────────────────────────────

function burnHeadline(videoPath, headline, outputPath, videoWidth, videoHeight) {
  const isVertical = videoHeight > videoWidth;
  const fontSize = Math.round(videoWidth / (isVertical ? 10 : 16));
  const yPos = isVertical ? Math.round(videoHeight * 0.15) : Math.round(videoHeight * 0.12);
  const boxPadding = Math.round(fontSize * 0.4);

  // ASS approach: create a headline-only ASS file
  const assContent = `[Script Info]
Title: Hook Headline
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Headline,Arial Black,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&HCC000000,1,0,0,0,100,100,3,0,3,4,3,8,30,30,${yPos},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,${formatASSTime(0.3)},${formatASSTime(headline.duration || 4)},Headline,,0,0,0,,{\\fad(300,400)\\fscx85\\fscy85\\t(0,250,\\fscx100\\fscy100)}${headline.text}
`;

  const tmpAss = `/tmp/aiox-headline-${Date.now()}.ass`;
  fs.writeFileSync(tmpAss, assContent);

  // Try ass filter first, then subtitles, then drawtext
  const strategies = [
    `ffmpeg -y -i "${videoPath}" -vf "ass='${tmpAss}'" -c:a copy "${outputPath}"`,
    `ffmpeg -y -i "${videoPath}" -vf "subtitles='${tmpAss}'" -c:a copy "${outputPath}"`,
  ];

  let success = false;
  for (const cmd of strategies) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 300000 });
      success = true;
      break;
    } catch { /* try next */ }
  }

  // Fallback: drawtext (no libass needed)
  if (!success) {
    const escaped = headline.text.replace(/'/g, '').replace(/:/g, '\\:');
    const dtCmd = `ffmpeg -y -i "${videoPath}" -vf "drawtext=text='${escaped}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=${yPos}:enable='between(t,0.3,${headline.duration || 4})'" -c:a copy "${outputPath}"`;
    execSync(dtCmd, { stdio: 'pipe', timeout: 300000 });
  }

  if (fs.existsSync(tmpAss)) fs.unlinkSync(tmpAss);
}

// ── Apply Headlines to Top Cuts ────────────────────────────

function applyHeadlinesToProject(projectId, opts = {}) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const transcriptionPath = path.join(projectDir, 'analysis', 'transcription.json');
  const productionDir = path.join(projectDir, 'production');

  if (!fs.existsSync(cutsPath) || !fs.existsSync(transcriptionPath)) {
    throw new Error('Cuts or transcription not found');
  }

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));

  // Only apply to top cuts (score >= 8 or top 10)
  const minScore = opts.minScore || 8;
  const maxCuts = opts.maxCuts || 10;
  const topCuts = cutsData.suggestedCuts
    .filter(c => c.status === 'approved')
    .sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))
    .slice(0, maxCuts)
    .filter(c => (c.engagementScore || 0) >= minScore || cutsData.suggestedCuts.indexOf(c) < maxCuts);

  const results = [];

  for (const cut of topCuts) {
    const headline = generateHeadline(cut, transcription);
    if (!headline) continue;

    // Find the assembled/subtitled video
    const assembledPath = path.join(productionDir, `assembled-${cut.id}.mp4`);
    if (!fs.existsSync(assembledPath)) continue;

    // Get video dimensions
    try {
      const probCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${assembledPath}"`;
      const dims = execSync(probCmd, { stdio: 'pipe', timeout: 10000 }).toString().trim().split(',');
      const w = parseInt(dims[0]) || 1080;
      const h = parseInt(dims[1]) || 1920;

      const headlinedPath = path.join(productionDir, `headlined-${cut.id}.mp4`);
      console.log(`  Headline for ${cut.id}: "${headline.text}" (${headline.type})`);
      burnHeadline(assembledPath, headline, headlinedPath, w, h);

      // Replace assembled with headlined version
      fs.unlinkSync(assembledPath);
      fs.renameSync(headlinedPath, assembledPath);

      // Save headline info to cut
      cut.headline = headline;
      results.push({ cutId: cut.id, headline: headline.text, type: headline.type });
    } catch (err) {
      console.log(`  Headline skipped for ${cut.id}: ${err.message}`);
    }
  }

  // Save updated cuts
  fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));

  return { applied: results.length, headlines: results };
}

module.exports = {
  generateHeadline,
  burnHeadline,
  applyHeadlinesToProject,
  TEMPLATES,
  HOOK_WORDS,
};
