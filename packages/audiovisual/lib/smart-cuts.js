#!/usr/bin/env node
'use strict';

/**
 * smart-cuts.js — Intelligent cut detection and suggestion engine
 * Story: AV-3.1
 *
 * Analyzes segmented blocks and suggests optimized cuts
 * for different platforms (Reels, TikTok, YouTube, Feed).
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { CUT_CATEGORIES } = require('./constants');
const { normalizeText } = require('./segment');

// Platform specs: target duration range and format
const PLATFORM_SPECS = {
  reels: { minDuration: 15, maxDuration: 60, format: '9:16', name: 'Instagram Reels' },
  tiktok: { minDuration: 15, maxDuration: 60, format: '9:16', name: 'TikTok' },
  shorts: { minDuration: 15, maxDuration: 60, format: '9:16', name: 'YouTube Shorts' },
  feed: { minDuration: 30, maxDuration: 90, format: '4:5', name: 'Instagram Feed' },
  youtube: { minDuration: 60, maxDuration: 180, format: '16:9', name: 'YouTube' },
};

// Target cut durations (Story AV-10): standard 90s and long 120s
const TARGET_DURATIONS = {
  standard: 90,
  long: 120,
};

// Category detection keywords
const CATEGORY_KEYWORDS = {
  viral: [
    'inacreditavel', 'chocante', 'ninguem', 'segredo', 'revelacao',
    'impressionante', 'absurdo', 'surreal', 'bizarro', 'polemic',
  ],
  autoridade: [
    'experiencia', 'anos', 'resultado', 'metodo', 'estrategia',
    'profissional', 'especialista', 'comprovado', 'funciona', 'garanto',
  ],
  educativo: [
    'como fazer', 'passo a passo', 'tutorial', 'aprenda', 'ensinar',
    'dica', 'truque', 'hack', 'explicar', 'entenda',
  ],
  storytelling: [
    'historia', 'aconteceu', 'uma vez', 'quando eu', 'lembro',
    'experiencia', 'passei', 'vivi', 'jornada', 'comecei',
  ],
  cta: [
    'compre', 'acesse', 'link', 'descricao', 'garanta', 'aproveite',
    'oferta', 'desconto', 'vagas', 'matricula',
  ],
  bastidores: [
    'bastidor', 'rotina', 'dia a dia', 'processo', 'como eu faco',
    'por tras', 'realidade', 'verdade', 'mostrando',
  ],
  tendencia: [
    'trend', 'tendencia', 'viral', 'todo mundo', 'momento',
    'novidade', 'lancamento', 'atualiz', 'novo',
  ],
};

function detectCategory(text) {
  const normalized = normalizeText(text);
  const scores = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = 0;
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        scores[category]++;
      }
    }
  }

  // Find highest scoring category
  let bestCategory = 'viral'; // default
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function calculateEngagementScore(block, category) {
  let score = 5.0; // base

  // Energy bonus
  if (block.energyLevel === 'high') score += 1.5;
  if (block.energyLevel === 'low') score -= 1.0;

  // Category bonus
  if (category === 'viral') score += 1.5;
  if (category === 'storytelling') score += 1.0;
  if (category === 'educativo') score += 0.5;

  // Duration sweet spot (15-45s = best for short-form)
  if (block.duration >= 15 && block.duration <= 45) score += 1.0;
  if (block.duration < 10) score -= 1.0;
  if (block.duration > 120) score -= 0.5;

  // Hook at start bonus
  if (block.type === 'hook') score += 1.0;

  // Clamp 0-10
  return parseFloat(Math.max(0, Math.min(10, score)).toFixed(1));
}

function generateObjective(category, blockType) {
  const objectives = {
    viral: 'Conteudo de alto impacto para compartilhamento massivo',
    autoridade: 'Posicionamento como referencia no assunto',
    educativo: 'Ensinar algo valioso de forma rapida',
    storytelling: 'Conectar emocionalmente com a audiencia',
    cta: 'Conversao direta — levar a acao',
    bastidores: 'Humanizar a marca com autenticidade',
    tendencia: 'Surfar trend atual para alcance organico',
  };
  return objectives[category] || 'Conteudo geral';
}

function suggestCutsForPlatform(blocks, platform, platformSpec) {
  const cuts = [];
  const { minDuration, maxDuration, format } = platformSpec;

  // Strategy 1: Individual blocks that fit the platform
  for (const block of blocks) {
    if (block.duration >= minDuration && block.duration <= maxDuration) {
      const text = block.transcriptExcerpt || '';
      const category = detectCategory(text);
      cuts.push({
        blocks: [block.id],
        start: block.start,
        end: block.end,
        duration: block.duration,
        category,
        objective: generateObjective(category, block.type),
        engagementScore: calculateEngagementScore(block, category),
        format,
        platform: [platform],
        source: 'single-block',
      });
    }
  }

  // Strategy 2: Combine hook + content blocks
  const hookBlocks = blocks.filter(b => b.type === 'hook' || b.type === 'intro');
  const contentBlocks = blocks.filter(b => b.type === 'content' || b.type === 'story');

  for (const hook of hookBlocks) {
    for (const content of contentBlocks) {
      if (content.start <= hook.end) continue; // content must come after hook

      const combinedDuration = (content.end - hook.start);
      if (combinedDuration >= minDuration && combinedDuration <= maxDuration) {
        const text = (hook.transcriptExcerpt || '') + ' ' + (content.transcriptExcerpt || '');
        const category = detectCategory(text);
        const avgBlock = {
          duration: combinedDuration,
          energyLevel: hook.energyLevel === 'high' || content.energyLevel === 'high' ? 'high' : 'medium',
          type: 'hook',
        };
        cuts.push({
          blocks: [hook.id, content.id],
          start: hook.start,
          end: content.end,
          duration: parseFloat(combinedDuration.toFixed(2)),
          category,
          objective: generateObjective(category, 'hook'),
          engagementScore: calculateEngagementScore(avgBlock, category),
          format,
          platform: [platform],
          source: 'hook-content',
        });
      }
    }
  }

  // Strategy 3: Combine content + CTA
  const ctaBlocks = blocks.filter(b => b.type === 'cta');
  for (const content of contentBlocks) {
    for (const cta of ctaBlocks) {
      if (cta.start <= content.end) continue;

      const combinedDuration = (cta.end - content.start);
      if (combinedDuration >= minDuration && combinedDuration <= maxDuration) {
        const text = (content.transcriptExcerpt || '') + ' ' + (cta.transcriptExcerpt || '');
        const category = 'cta';
        const avgBlock = {
          duration: combinedDuration,
          energyLevel: 'medium',
          type: 'content',
        };
        cuts.push({
          blocks: [content.id, cta.id],
          start: content.start,
          end: cta.end,
          duration: parseFloat(combinedDuration.toFixed(2)),
          category,
          objective: generateObjective(category, 'content'),
          engagementScore: calculateEngagementScore(avgBlock, category),
          format,
          platform: [platform],
          source: 'content-cta',
        });
      }
    }
  }

  return cuts;
}

function deduplicateCuts(cuts) {
  // Remove cuts with very similar time ranges
  const unique = [];
  for (const cut of cuts) {
    const isDuplicate = unique.some(existing => {
      const startDiff = Math.abs(existing.start - cut.start);
      const endDiff = Math.abs(existing.end - cut.end);
      return startDiff < 2 && endDiff < 2;
    });
    if (!isDuplicate) {
      unique.push(cut);
    }
  }
  return unique;
}

/**
 * Combine consecutive blocks to reach target durations (90s / 120s).
 * Story AV-10 — production rule for standard and long cuts.
 */
function suggestTargetDurationCuts(blocks) {
  const cuts = [];
  const tolerance = 10; // ±10s tolerance around target

  for (const [label, targetDuration] of Object.entries(TARGET_DURATIONS)) {
    // Sliding window over consecutive blocks
    for (let i = 0; i < blocks.length; i++) {
      let accumulated = 0;
      let endIdx = i;

      while (endIdx < blocks.length && accumulated < targetDuration + tolerance) {
        accumulated = blocks[endIdx].end - blocks[i].start;
        if (accumulated >= targetDuration - tolerance && accumulated <= targetDuration + tolerance) {
          const blockIds = [];
          for (let k = i; k <= endIdx; k++) {
            blockIds.push(blocks[k].id);
          }

          const combinedText = blocks
            .slice(i, endIdx + 1)
            .map(b => b.transcriptExcerpt || '')
            .join(' ');
          const category = detectCategory(combinedText);
          const bestEnergy = blocks.slice(i, endIdx + 1)
            .some(b => b.energyLevel === 'high') ? 'high' : 'medium';

          cuts.push({
            blocks: blockIds,
            start: blocks[i].start,
            end: blocks[endIdx].end,
            duration: parseFloat(accumulated.toFixed(2)),
            category,
            objective: generateObjective(category, blocks[i].type),
            engagementScore: calculateEngagementScore(
              { duration: accumulated, energyLevel: bestEnergy, type: blocks[i].type },
              category
            ),
            format: '9:16',
            platform: ['reels', 'tiktok'],
            source: `target-${label}`,
            targetDuration,
          });
          break;
        }
        endIdx++;
      }
    }
  }

  return cuts;
}

function generateSmartCuts(projectId) {
  const projectDir = getProjectDir(projectId);
  const analysisDir = path.join(projectDir, 'analysis');
  const cutsDir = path.join(projectDir, 'cuts');

  const segmentsPath = path.join(analysisDir, 'segments.json');
  if (!fs.existsSync(segmentsPath)) {
    throw new Error(
      `Segments not found for project ${projectId}.\n` +
      'Run segmentation first: node bin/av-segment.js <project-id>'
    );
  }

  const segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
  const blocks = segments.blocks;

  if (!blocks || blocks.length === 0) {
    throw new Error('No blocks found in segments');
  }

  // Generate cuts for all platforms
  let allCuts = [];
  for (const [platform, spec] of Object.entries(PLATFORM_SPECS)) {
    const platformCuts = suggestCutsForPlatform(blocks, platform, spec);
    allCuts.push(...platformCuts);
  }

  // Strategy AV-10: Generate cuts targeting 90s and 120s durations
  const targetDurationCuts = suggestTargetDurationCuts(blocks);
  allCuts.push(...targetDurationCuts);

  // Merge platform tags for identical cuts
  const merged = [];
  for (const cut of allCuts) {
    const existing = merged.find(m =>
      Math.abs(m.start - cut.start) < 0.5 && Math.abs(m.end - cut.end) < 0.5 && m.format === cut.format
    );
    if (existing) {
      for (const p of cut.platform) {
        if (!existing.platform.includes(p)) existing.platform.push(p);
      }
    } else {
      merged.push({ ...cut });
    }
  }

  // Deduplicate and sort by engagement score
  const uniqueCuts = deduplicateCuts(merged)
    .sort((a, b) => b.engagementScore - a.engagementScore);

  // Assign IDs
  const suggestedCuts = uniqueCuts.map((cut, idx) => ({
    id: `cut_${String(idx + 1).padStart(3, '0')}`,
    ...cut,
    status: 'suggested',
  }));

  const result = {
    suggestedCuts,
    totalSuggested: suggestedCuts.length,
    platformBreakdown: Object.fromEntries(
      Object.keys(PLATFORM_SPECS).map(p => [
        p,
        suggestedCuts.filter(c => c.platform.includes(p)).length,
      ])
    ),
    categoryBreakdown: Object.fromEntries(
      CUT_CATEGORIES.map(c => [
        c,
        suggestedCuts.filter(cut => cut.category === c).length,
      ])
    ),
    createdAt: new Date().toISOString(),
  };

  // Save
  fs.mkdirSync(cutsDir, { recursive: true });
  fs.writeFileSync(
    path.join(cutsDir, 'suggested-cuts.json'),
    JSON.stringify(result, null, 2)
  );

  return result;
}

module.exports = {
  generateSmartCuts,
  detectCategory,
  calculateEngagementScore,
  generateObjective,
  suggestCutsForPlatform,
  suggestTargetDurationCuts,
  deduplicateCuts,
  PLATFORM_SPECS,
  TARGET_DURATIONS,
};
