#!/usr/bin/env node
'use strict';

/**
 * smart-cuts.js — Intelligent cut detection and suggestion engine
 * Story: AV-3.1 + AV-12 refinements
 *
 * Analyzes segmented blocks and suggests optimized cuts
 * for different platforms (Reels, TikTok, YouTube, Feed).
 *
 * Refinements (AV-12):
 * - Cut boundaries snap to sentence ends / natural pauses
 * - Multi-factor engagement scoring (energy, speech pace, scene variety, position)
 * - Narrative arc combinations (opening → development → climax)
 * - Overlap-based deduplication (>50% overlap = duplicate)
 * - Positional weighting for category detection
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

// Category detection keywords with weights
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

/**
 * Detect category with positional weighting.
 * Keywords in the first 30% of text get 2x weight (hook zone).
 */
function detectCategory(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  const hookZoneEnd = Math.ceil(words.length * 0.3);
  const hookZone = words.slice(0, hookZoneEnd).join(' ');
  const scores = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = 0;
    for (const kw of keywords) {
      // 2x weight if keyword appears in hook zone (first 30%)
      if (hookZone.includes(kw)) {
        scores[category] += 2;
      } else if (normalized.includes(kw)) {
        scores[category] += 1;
      }
    }
  }

  let bestCategory = 'viral';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Multi-factor engagement scoring (0-10).
 *
 * Factors:
 *   1. Energy level (audio intensity)
 *   2. Category viral potential
 *   3. Duration sweet spot per platform
 *   4. Hook presence at start
 *   5. Speech pace (words/sec via wordCount/duration)
 *   6. Scene variety (fala vs tela — mixed is more dynamic)
 *   7. Position in video (first 25% gets bonus — audiences drop off)
 *   8. Block density (more segments = more visual cuts = more engaging)
 */
function calculateEngagementScore(block, category, options = {}) {
  let score = 4.0; // base (lower base, more room for differentiation)

  // 1. Energy level (+2 / -1)
  if (block.energyLevel === 'high') score += 2.0;
  else if (block.energyLevel === 'medium') score += 0.5;
  else if (block.energyLevel === 'low') score -= 1.0;

  // 2. Category viral potential
  const categoryBonus = {
    viral: 2.0,
    storytelling: 1.5,
    educativo: 1.0,
    autoridade: 0.8,
    tendencia: 1.2,
    bastidores: 0.5,
    cta: 0.3,
  };
  score += categoryBonus[category] || 0;

  // 3. Duration sweet spot — bell curve around ideal
  const duration = block.duration || 0;
  if (duration >= 15 && duration <= 30) score += 1.5;       // viral sweet spot
  else if (duration >= 30 && duration <= 60) score += 1.0;  // reels/tiktok sweet
  else if (duration >= 60 && duration <= 90) score += 0.5;  // feed sweet
  else if (duration < 10) score -= 1.5;                     // too short
  else if (duration > 150) score -= 1.0;                    // too long

  // 4. Hook presence
  if (block.type === 'hook') score += 1.5;
  else if (block.type === 'intro') score += 0.5;

  // 5. Speech pace (if wordCount available)
  if (block.wordCount && duration > 0) {
    const wps = block.wordCount / duration;
    if (wps >= 2.5 && wps <= 4.0) score += 0.8;  // dynamic but comprehensible
    else if (wps > 4.0) score += 0.3;              // fast but might lose people
    else if (wps < 1.0) score -= 0.5;              // too slow / dead air
  }

  // 6. Scene variety (mixed fala+tela is more dynamic)
  if (block.sceneType === 'tela') score += 0.3;   // screen content adds visual interest
  if (block.sceneChangeRate > 0.3) score += 0.5;  // high visual dynamism

  // 7. Position bonus (earlier = higher retention)
  if (options.totalDuration && block.start !== undefined) {
    const positionRatio = block.start / options.totalDuration;
    if (positionRatio < 0.25) score += 1.0;        // first quarter
    else if (positionRatio < 0.50) score += 0.5;   // second quarter
    else if (positionRatio > 0.85) score -= 0.3;   // tail end (low retention)
  }

  // 8. Block density (segment count as proxy for visual cuts)
  if (block.segmentCount) {
    if (block.segmentCount >= 5) score += 0.5;     // lots of variety
    else if (block.segmentCount <= 1) score -= 0.3; // single static segment
  }

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

/**
 * Snap a timestamp to the nearest block boundary (start or end).
 * Avoids cutting mid-sentence by aligning with natural pauses.
 * Tolerance: snaps if within snapRadius seconds of a boundary.
 */
function snapToBoundary(timestamp, blocks, snapRadius = 1.5) {
  let nearest = timestamp;
  let minDist = snapRadius;

  for (const block of blocks) {
    const distStart = Math.abs(block.start - timestamp);
    const distEnd = Math.abs(block.end - timestamp);

    if (distStart < minDist) {
      minDist = distStart;
      nearest = block.start;
    }
    if (distEnd < minDist) {
      minDist = distEnd;
      nearest = block.end;
    }
  }

  return parseFloat(nearest.toFixed(2));
}

/**
 * Load transcription segments to find sentence-level boundaries.
 * Returns array of pause points (end-of-sentence timestamps).
 */
function findSentenceBoundaries(analysisDir) {
  const transcriptionPath = path.join(analysisDir, 'transcription.json');
  if (!fs.existsSync(transcriptionPath)) return [];

  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
  const segments = transcription.segments || [];
  const boundaries = [];

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    // Natural pause > 0.5s = good cut point
    if (gap >= 0.5) {
      boundaries.push({
        timestamp: segments[i - 1].end,
        gap,
        strength: gap >= 2.0 ? 'strong' : gap >= 1.0 ? 'medium' : 'weak',
      });
    }
  }

  return boundaries;
}

/**
 * Snap cut start/end to nearest sentence boundary for clean cuts.
 * Prefers strong boundaries (longer pauses).
 */
function snapToSentence(timestamp, boundaries, maxDrift = 3.0) {
  if (boundaries.length === 0) return timestamp;

  let best = null;
  let bestDist = maxDrift;

  for (const b of boundaries) {
    const dist = Math.abs(b.timestamp - timestamp);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    } else if (dist === bestDist && best && b.strength === 'strong') {
      best = b; // prefer stronger boundary at same distance
    }
  }

  return best ? parseFloat(best.timestamp.toFixed(2)) : timestamp;
}

function suggestCutsForPlatform(blocks, platform, platformSpec, options = {}) {
  const cuts = [];
  const { minDuration, maxDuration, format } = platformSpec;
  const { sentenceBoundaries, totalDuration } = options;
  const scoreOpts = { totalDuration };

  // Strategy 1: Individual blocks that fit the platform
  for (const block of blocks) {
    if (block.duration >= minDuration && block.duration <= maxDuration) {
      const text = block.transcriptExcerpt || '';
      const category = detectCategory(text);
      const start = sentenceBoundaries
        ? snapToSentence(block.start, sentenceBoundaries)
        : block.start;
      const end = sentenceBoundaries
        ? snapToSentence(block.end, sentenceBoundaries)
        : block.end;
      const duration = parseFloat((end - start).toFixed(2));

      if (duration >= minDuration && duration <= maxDuration) {
        cuts.push({
          blocks: [block.id],
          start,
          end,
          duration,
          category,
          objective: generateObjective(category, block.type),
          engagementScore: calculateEngagementScore(block, category, scoreOpts),
          transcriptExcerpt: text.slice(0, 150),
          format,
          platform: [platform],
          source: 'single-block',
        });
      }
    }
  }

  // Strategy 2: Combine hook + content blocks
  const hookBlocks = blocks.filter(b => b.type === 'hook' || b.type === 'intro');
  const contentBlocks = blocks.filter(b => b.type === 'content' || b.type === 'story');

  for (const hook of hookBlocks) {
    for (const content of contentBlocks) {
      if (content.start <= hook.end) continue;

      const rawStart = hook.start;
      const rawEnd = content.end;
      const start = sentenceBoundaries ? snapToSentence(rawStart, sentenceBoundaries) : rawStart;
      const end = sentenceBoundaries ? snapToSentence(rawEnd, sentenceBoundaries) : rawEnd;
      const combinedDuration = parseFloat((end - start).toFixed(2));

      if (combinedDuration >= minDuration && combinedDuration <= maxDuration) {
        const text = (hook.transcriptExcerpt || '') + ' ' + (content.transcriptExcerpt || '');
        const category = detectCategory(text);
        const avgBlock = {
          duration: combinedDuration,
          energyLevel: hook.energyLevel === 'high' || content.energyLevel === 'high' ? 'high' : 'medium',
          type: 'hook',
          wordCount: (hook.wordCount || 0) + (content.wordCount || 0),
          start: start,
          sceneType: hook.sceneType !== content.sceneType ? 'mixed' : hook.sceneType,
          sceneChangeRate: Math.max(hook.sceneChangeRate || 0, content.sceneChangeRate || 0),
          segmentCount: (hook.segmentCount || 1) + (content.segmentCount || 1),
        };
        cuts.push({
          blocks: [hook.id, content.id],
          start,
          end,
          duration: combinedDuration,
          category,
          objective: generateObjective(category, 'hook'),
          engagementScore: calculateEngagementScore(avgBlock, category, scoreOpts),
          transcriptExcerpt: text.slice(0, 150),
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

      const rawStart = content.start;
      const rawEnd = cta.end;
      const start = sentenceBoundaries ? snapToSentence(rawStart, sentenceBoundaries) : rawStart;
      const end = sentenceBoundaries ? snapToSentence(rawEnd, sentenceBoundaries) : rawEnd;
      const combinedDuration = parseFloat((end - start).toFixed(2));

      if (combinedDuration >= minDuration && combinedDuration <= maxDuration) {
        const text = (content.transcriptExcerpt || '') + ' ' + (cta.transcriptExcerpt || '');
        const category = 'cta';
        const avgBlock = {
          duration: combinedDuration,
          energyLevel: 'medium',
          type: 'content',
          wordCount: (content.wordCount || 0) + (cta.wordCount || 0),
          start: start,
          segmentCount: (content.segmentCount || 1) + (cta.segmentCount || 1),
        };
        cuts.push({
          blocks: [content.id, cta.id],
          start,
          end,
          duration: combinedDuration,
          category,
          objective: generateObjective(category, 'content'),
          engagementScore: calculateEngagementScore(avgBlock, category, scoreOpts),
          transcriptExcerpt: text.slice(0, 150),
          format,
          platform: [platform],
          source: 'content-cta',
        });
      }
    }
  }

  // Strategy 4: Narrative arc — hook + content + climax/cta (3-block combo)
  for (const hook of hookBlocks) {
    for (let ci = 0; ci < contentBlocks.length; ci++) {
      const content = contentBlocks[ci];
      if (content.start <= hook.end) continue;

      // Find a climax block (high energy content or cta after this content)
      const climaxCandidates = blocks.filter(b =>
        b.start > content.end &&
        (b.type === 'cta' || b.type === 'content' || b.type === 'story') &&
        b.energyLevel !== 'low',
      );

      for (const climax of climaxCandidates) {
        const rawStart = hook.start;
        const rawEnd = climax.end;
        const start = sentenceBoundaries ? snapToSentence(rawStart, sentenceBoundaries) : rawStart;
        const end = sentenceBoundaries ? snapToSentence(rawEnd, sentenceBoundaries) : rawEnd;
        const arcDuration = parseFloat((end - start).toFixed(2));

        if (arcDuration >= minDuration && arcDuration <= maxDuration) {
          const text = [hook, content, climax].map(b => b.transcriptExcerpt || '').join(' ');
          const category = detectCategory(text);
          const totalWords = [hook, content, climax].reduce((s, b) => s + (b.wordCount || 0), 0);
          const totalSegments = [hook, content, climax].reduce((s, b) => s + (b.segmentCount || 1), 0);
          const hasHighEnergy = [hook, content, climax].some(b => b.energyLevel === 'high');
          const sceneTypes = new Set([hook, content, climax].map(b => b.sceneType).filter(Boolean));

          const arcBlock = {
            duration: arcDuration,
            energyLevel: hasHighEnergy ? 'high' : 'medium',
            type: 'hook',
            wordCount: totalWords,
            start: start,
            sceneType: sceneTypes.size > 1 ? 'mixed' : sceneTypes.values().next().value,
            sceneChangeRate: Math.max(
              hook.sceneChangeRate || 0,
              content.sceneChangeRate || 0,
              climax.sceneChangeRate || 0,
            ),
            segmentCount: totalSegments,
          };

          // Narrative arc gets a bonus in scoring
          const arcScore = calculateEngagementScore(arcBlock, category, scoreOpts);

          cuts.push({
            blocks: [hook.id, content.id, climax.id],
            start,
            end,
            duration: arcDuration,
            category,
            objective: generateObjective(category, 'hook'),
            engagementScore: parseFloat(Math.min(10, arcScore + 0.5).toFixed(1)), // arc bonus
            transcriptExcerpt: text.slice(0, 150),
            format,
            platform: [platform],
            source: 'narrative-arc',
          });
        }
      }
    }
  }

  return cuts;
}

/**
 * Overlap-based deduplication.
 * Two cuts are duplicates if they overlap > 50% of the shorter one's duration.
 * When duplicate found, keep the one with higher engagement score.
 */
function deduplicateCuts(cuts) {
  // Sort by score descending so we keep the best version
  const sorted = [...cuts].sort((a, b) => b.engagementScore - a.engagementScore);
  const unique = [];

  for (const cut of sorted) {
    const isDuplicate = unique.some(existing => {
      const overlapStart = Math.max(existing.start, cut.start);
      const overlapEnd = Math.min(existing.end, cut.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const shorterDuration = Math.min(existing.duration, cut.duration);
      // Duplicate if > 50% overlap of shorter cut
      return shorterDuration > 0 && (overlap / shorterDuration) > 0.5;
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
 * Enhanced: uses sentence boundaries and multi-factor scoring.
 */
function suggestTargetDurationCuts(blocks, options = {}) {
  const cuts = [];
  const tolerance = 10;
  const { sentenceBoundaries, totalDuration } = options;
  const scoreOpts = { totalDuration };

  for (const [label, targetDuration] of Object.entries(TARGET_DURATIONS)) {
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

          const slicedBlocks = blocks.slice(i, endIdx + 1);
          const combinedText = slicedBlocks.map(b => b.transcriptExcerpt || '').join(' ');
          const category = detectCategory(combinedText);
          const bestEnergy = slicedBlocks.some(b => b.energyLevel === 'high') ? 'high' : 'medium';
          const totalWords = slicedBlocks.reduce((s, b) => s + (b.wordCount || 0), 0);
          const totalSegments = slicedBlocks.reduce((s, b) => s + (b.segmentCount || 1), 0);

          // Snap boundaries
          let start = blocks[i].start;
          let end = blocks[endIdx].end;
          if (sentenceBoundaries) {
            start = snapToSentence(start, sentenceBoundaries);
            end = snapToSentence(end, sentenceBoundaries);
          }
          const duration = parseFloat((end - start).toFixed(2));

          cuts.push({
            blocks: blockIds,
            start,
            end,
            duration,
            category,
            objective: generateObjective(category, blocks[i].type),
            engagementScore: calculateEngagementScore(
              {
                duration,
                energyLevel: bestEnergy,
                type: blocks[i].type,
                wordCount: totalWords,
                start: start,
                segmentCount: totalSegments,
              },
              category,
              scoreOpts,
            ),
            transcriptExcerpt: combinedText.slice(0, 150),
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
      'Run segmentation first: node bin/av-segment.js <project-id>',
    );
  }

  const segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
  const blocks = segments.blocks;

  if (!blocks || blocks.length === 0) {
    throw new Error('No blocks found in segments');
  }

  // Load sentence boundaries for clean cut points
  const sentenceBoundaries = findSentenceBoundaries(analysisDir);
  const totalDuration = segments.totalDuration || 0;
  const cutOptions = { sentenceBoundaries, totalDuration };

  console.log(`  ${sentenceBoundaries.length} sentence boundaries found for cut snapping`);

  // Generate cuts for all platforms
  const allCuts = [];
  for (const [platform, spec] of Object.entries(PLATFORM_SPECS)) {
    const platformCuts = suggestCutsForPlatform(blocks, platform, spec, cutOptions);
    allCuts.push(...platformCuts);
  }

  // Strategy AV-10: Generate cuts targeting 90s and 120s durations
  const targetDurationCuts = suggestTargetDurationCuts(blocks, cutOptions);
  allCuts.push(...targetDurationCuts);

  // Merge platform tags for identical cuts
  const merged = [];
  for (const cut of allCuts) {
    const existing = merged.find(m =>
      Math.abs(m.start - cut.start) < 0.5 && Math.abs(m.end - cut.end) < 0.5 && m.format === cut.format,
    );
    if (existing) {
      for (const p of cut.platform) {
        if (!existing.platform.includes(p)) existing.platform.push(p);
      }
      // Keep highest engagement score when merging
      if (cut.engagementScore > existing.engagementScore) {
        existing.engagementScore = cut.engagementScore;
      }
    } else {
      merged.push({ ...cut });
    }
  }

  // Deduplicate (overlap-based) and sort by engagement score
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
      ]),
    ),
    categoryBreakdown: Object.fromEntries(
      CUT_CATEGORIES.map(c => [
        c,
        suggestedCuts.filter(cut => cut.category === c).length,
      ]),
    ),
    refinements: {
      sentenceBoundariesUsed: sentenceBoundaries.length,
      narrativeArcCuts: suggestedCuts.filter(c => c.source === 'narrative-arc').length,
      deduplicationMethod: 'overlap-50pct',
      scoringModel: 'multi-factor-v2',
    },
    createdAt: new Date().toISOString(),
  };

  // Save
  fs.mkdirSync(cutsDir, { recursive: true });
  fs.writeFileSync(
    path.join(cutsDir, 'suggested-cuts.json'),
    JSON.stringify(result, null, 2),
  );

  console.log(`  ${suggestedCuts.length} cuts suggested (${result.refinements.narrativeArcCuts} narrative arcs)`);

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
  snapToBoundary,
  snapToSentence,
  findSentenceBoundaries,
  PLATFORM_SPECS,
  TARGET_DURATIONS,
};
