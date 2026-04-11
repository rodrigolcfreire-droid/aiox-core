#!/usr/bin/env node
'use strict';

/**
 * scale.js — Variation generator for scaling content
 * Story: AV-5.1
 *
 * Combines Hook + Body + CTA blocks to create
 * multiple video variations automatically.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { CUT_CATEGORIES, VIDEO_FORMATS } = require('./constants');

function loadSegments(projectId) {
  const segPath = path.join(getProjectDir(projectId), 'analysis', 'segments.json');
  if (!fs.existsSync(segPath)) {
    throw new Error(`Segments not found for project ${projectId}`);
  }
  return JSON.parse(fs.readFileSync(segPath, 'utf8'));
}

function loadCuts(projectId) {
  const cutsPath = path.join(getProjectDir(projectId), 'cuts', 'suggested-cuts.json');
  if (!fs.existsSync(cutsPath)) {
    throw new Error(`Cuts not found for project ${projectId}`);
  }
  return JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
}

function generateVariations(projectId, options = {}) {
  const segData = loadSegments(projectId);
  const cutsData = loadCuts(projectId);
  const blocks = segData.blocks;
  const maxVariations = options.maxVariations || 20;

  // Group blocks by type
  const hooks = blocks.filter(b => b.type === 'hook' || b.type === 'intro');
  const bodies = blocks.filter(b => b.type === 'content' || b.type === 'story');
  const ctas = blocks.filter(b => b.type === 'cta' || b.type === 'outro');

  const variations = [];

  // Strategy 1: Hook + Body combinations
  for (const hook of hooks) {
    for (const body of bodies) {
      if (body.start <= hook.end) continue;
      const duration = body.end - hook.start;
      if (duration < 15 || duration > 90) continue;

      variations.push({
        type: 'hook-body',
        blocks: [hook.id, body.id],
        start: hook.start,
        end: body.end,
        duration: parseFloat(duration.toFixed(2)),
        description: `${hook.title} + ${body.title}`,
      });
    }
  }

  // Strategy 2: Hook + Body + CTA combinations
  for (const hook of hooks) {
    for (const body of bodies) {
      if (body.start <= hook.end) continue;
      for (const cta of ctas) {
        if (cta.start <= body.end) continue;
        const duration = cta.end - hook.start;
        if (duration < 20 || duration > 90) continue;

        variations.push({
          type: 'hook-body-cta',
          blocks: [hook.id, body.id, cta.id],
          start: hook.start,
          end: cta.end,
          duration: parseFloat(duration.toFixed(2)),
          description: `${hook.title} + ${body.title} + CTA`,
        });
      }
    }
  }

  // Strategy 3: Format variations of existing cuts
  const existingCuts = cutsData.suggestedCuts.slice(0, 5); // top 5
  const formats = ['9:16', '16:9', '1:1'];
  for (const cut of existingCuts) {
    for (const format of formats) {
      if (cut.format === format) continue;
      variations.push({
        type: 'format-variation',
        blocks: cut.blocks,
        start: cut.start,
        end: cut.end,
        duration: cut.duration,
        description: `${cut.id} em ${format}`,
        originalCut: cut.id,
        format,
      });
    }
  }

  // Deduplicate by time range
  const unique = [];
  for (const v of variations) {
    const isDup = unique.some(u =>
      Math.abs(u.start - v.start) < 1 && Math.abs(u.end - v.end) < 1 && u.type === v.type,
    );
    if (!isDup) unique.push(v);
  }

  // Limit and assign IDs
  const limited = unique.slice(0, maxVariations).map((v, i) => ({
    id: `var_${String(i + 1).padStart(3, '0')}`,
    ...v,
  }));

  const result = {
    variations: limited,
    totalVariations: limited.length,
    byType: {
      'hook-body': limited.filter(v => v.type === 'hook-body').length,
      'hook-body-cta': limited.filter(v => v.type === 'hook-body-cta').length,
      'format-variation': limited.filter(v => v.type === 'format-variation').length,
    },
    createdAt: new Date().toISOString(),
  };

  // Save
  const cutsDir = path.join(getProjectDir(projectId), 'cuts');
  fs.writeFileSync(
    path.join(cutsDir, 'variations.json'),
    JSON.stringify(result, null, 2),
  );

  return result;
}

module.exports = {
  generateVariations,
  loadSegments,
  loadCuts,
};
