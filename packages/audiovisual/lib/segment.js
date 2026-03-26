#!/usr/bin/env node
'use strict';

/**
 * segment.js — Video segmentation engine
 * Story: AV-2.3
 *
 * Divides video into logical blocks using heuristics:
 *   - Pause detection (>2s gaps between segments)
 *   - Keyword-based topic detection
 *   - Energy level estimation
 *   - Block type classification
 */

const fs = require('fs');
const path = require('path');
const { loadProject, getProjectDir } = require('./project');
const { classifyScenes } = require('./scene-detector');

const PAUSE_THRESHOLD = 2.0; // seconds — gap that indicates a new block
const MIN_BLOCK_DURATION = 5.0; // minimum block duration in seconds
const MAX_BLOCK_DURATION = 120.0; // maximum block duration in seconds

// Keywords for block type classification
const TYPE_KEYWORDS = {
  hook: [
    'voce sabia', 'ja imaginou', 'e se eu te dissesse', 'olha so', 'presta atencao',
    'isso vai mudar', 'segredo', 'revelacao', 'chocante', 'inacreditavel',
    'ninguem te conta', 'verdade sobre', 'descubra', 'pare tudo',
  ],
  intro: [
    'fala galera', 'ola pessoal', 'bem vindo', 'bom dia', 'boa tarde', 'boa noite',
    'salve', 'e ai', 'nesse video', 'hoje eu vou', 'video de hoje',
  ],
  cta: [
    'se inscreve', 'inscreva', 'deixa o like', 'comenta', 'compartilha',
    'link na descricao', 'ativa o sininho', 'notificacao', 'segue la',
    'clica', 'compre', 'acesse', 'garanta', 'aproveite',
  ],
  outro: [
    'ate o proximo', 'valeu galera', 'forte abraco', 'tchau', 'nos vemos',
    'ate mais', 'obrigado', 'obrigada', 'foi isso', 'era isso',
  ],
  story: [
    'uma vez', 'historia', 'quando eu', 'aconteceu', 'lembro', 'no passado',
    'experiencia', 'vivi', 'passei por', 'minha vida',
  ],
};

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyBlockType(text, position, totalBlocks) {
  const normalized = normalizeText(text);

  // Position-based heuristics
  if (position === 0) {
    // First block is likely intro or hook
    for (const kw of TYPE_KEYWORDS.hook) {
      if (normalized.includes(kw)) return 'hook';
    }
    return 'intro';
  }

  if (position === totalBlocks - 1) {
    // Last block is likely outro or cta
    for (const kw of TYPE_KEYWORDS.outro) {
      if (normalized.includes(kw)) return 'outro';
    }
    for (const kw of TYPE_KEYWORDS.cta) {
      if (normalized.includes(kw)) return 'cta';
    }
    return 'outro';
  }

  // Keyword-based classification
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) return type;
    }
  }

  // Default: content
  return 'content';
}

function estimateEnergyLevel(segments) {
  if (segments.length === 0) return 'medium';

  // Estimate based on speech density (words per second)
  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const totalDuration = segments[segments.length - 1].end - segments[0].start;

  if (totalDuration <= 0) return 'medium';

  const wordsPerSecond = totalWords / totalDuration;

  if (wordsPerSecond > 3.5) return 'high';
  if (wordsPerSecond < 1.5) return 'low';
  return 'medium';
}

function generateTitle(text) {
  const words = text.split(/\s+/).slice(0, 8);
  let title = words.join(' ');
  if (text.split(/\s+/).length > 8) title += '...';
  return title;
}

function segmentVideo(projectId) {
  const projectDir = getProjectDir(projectId);
  const analysisDir = path.join(projectDir, 'analysis');

  const transcriptionPath = path.join(analysisDir, 'transcription.json');
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error(
      `Transcription not found for project ${projectId}.\n` +
      'Run transcription first: node bin/av-transcribe.js <project-id>'
    );
  }

  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
  const segments = transcription.segments;

  if (!segments || segments.length === 0) {
    throw new Error('Transcription has no segments');
  }

  // Group segments into blocks based on pauses
  const rawBlocks = [];
  let currentBlock = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;

    if (gap >= PAUSE_THRESHOLD) {
      rawBlocks.push(currentBlock);
      currentBlock = [segments[i]];
    } else {
      currentBlock.push(segments[i]);
    }
  }
  if (currentBlock.length > 0) {
    rawBlocks.push(currentBlock);
  }

  // Merge very short blocks with neighbors
  const mergedBlocks = [];
  let buffer = [];

  for (const block of rawBlocks) {
    buffer.push(...block);
    const duration = buffer[buffer.length - 1].end - buffer[0].start;

    if (duration >= MIN_BLOCK_DURATION) {
      mergedBlocks.push([...buffer]);
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    if (mergedBlocks.length > 0) {
      mergedBlocks[mergedBlocks.length - 1].push(...buffer);
    } else {
      mergedBlocks.push(buffer);
    }
  }

  // Split blocks that are too long — recursively until all fit MAX_BLOCK_DURATION
  function splitBlock(segments) {
    if (segments.length <= 1) return [segments];
    const duration = segments[segments.length - 1].end - segments[0].start;
    if (duration <= MAX_BLOCK_DURATION) return [segments];

    // Find best split point: largest gap near the middle
    const midTime = segments[0].start + duration / 2;
    let bestIdx = Math.floor(segments.length / 2);
    let bestScore = -1;

    // Search around the middle for a natural pause
    const searchStart = Math.max(1, Math.floor(segments.length * 0.3));
    const searchEnd = Math.min(segments.length - 1, Math.ceil(segments.length * 0.7));
    for (let i = searchStart; i < searchEnd; i++) {
      const gap = segments[i].start - segments[i - 1].end;
      const distFromMid = Math.abs(segments[i].start - midTime);
      // Prefer larger gaps closer to the middle
      const score = gap * 2 - distFromMid / duration;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const left = segments.slice(0, bestIdx);
    const right = segments.slice(bestIdx);
    return [...splitBlock(left), ...splitBlock(right)];
  }

  const finalBlocks = [];
  for (const block of mergedBlocks) {
    const parts = splitBlock(block);
    finalBlocks.push(...parts);
  }

  // Build block objects
  const totalBlocks = finalBlocks.length;
  const blocks = finalBlocks.map((blockSegments, idx) => {
    const text = blockSegments.map(s => s.text).join(' ');
    const start = blockSegments[0].start;
    const end = blockSegments[blockSegments.length - 1].end;

    return {
      id: `block_${String(idx + 1).padStart(3, '0')}`,
      type: classifyBlockType(text, idx, totalBlocks),
      start,
      end,
      duration: parseFloat((end - start).toFixed(2)),
      title: generateTitle(text),
      transcriptExcerpt: text.slice(0, 150),
      wordCount: text.split(/\s+/).length,
      energyLevel: estimateEnergyLevel(blockSegments),
      segmentCount: blockSegments.length,
    };
  });

  // Enrich blocks with visual scene type (fala vs tela)
  // Skip for videos > 10min to avoid blocking the server too long
  const sourceDir = path.join(projectDir, 'source');
  if (transcription.totalDuration <= 600) {
    try {
      const sourceFiles = fs.readdirSync(sourceDir);
      const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
      if (videoFile) {
        const videoPath = path.join(sourceDir, videoFile);
        const scenes = classifyScenes(videoPath, transcription.totalDuration);
        for (const block of blocks) {
          const blockMid = (block.start + block.end) / 2;
          const scene = scenes.find(s => blockMid >= s.start && blockMid < s.end);
          block.sceneType = scene ? scene.type : 'fala';
          block.sceneChangeRate = scene ? scene.changeRate : 0;
        }
        console.log(`  Scene detection: ${scenes.length} scenes classified`);
      }
    } catch (err) {
      console.log(`  Scene detection skipped: ${err.message}`);
      for (const block of blocks) {
        block.sceneType = 'fala';
        block.sceneChangeRate = 0;
      }
    }
  } else {
    console.log(`  Scene detection skipped: video too long (${Math.floor(transcription.totalDuration / 60)}min > 10min limit)`);
    for (const block of blocks) {
      block.sceneType = 'fala';
      block.sceneChangeRate = 0;
    }
  }

  const result = {
    blocks,
    totalBlocks: blocks.length,
    totalDuration: parseFloat(transcription.totalDuration.toFixed(2)),
    averageBlockDuration: parseFloat(
      (blocks.reduce((sum, b) => sum + b.duration, 0) / blocks.length).toFixed(2)
    ),
    createdAt: new Date().toISOString(),
  };

  // Save
  fs.writeFileSync(
    path.join(analysisDir, 'segments.json'),
    JSON.stringify(result, null, 2)
  );

  return result;
}

module.exports = {
  segmentVideo,
  classifyBlockType,
  estimateEnergyLevel,
  normalizeText,
  generateTitle,
  PAUSE_THRESHOLD,
  MIN_BLOCK_DURATION,
  MAX_BLOCK_DURATION,
};
