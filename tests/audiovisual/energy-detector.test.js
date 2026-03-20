'use strict';

/**
 * Tests for Central Audiovisual — Energy Detector
 * Story: AV-10
 */

const fs = require('fs');
const path = require('path');
const {
  parseVolumeOutput,
  findPeakWindow,
  HOOK_DURATION,
  WINDOW_SIZE,
  WINDOW_STEP,
} = require('../../packages/audiovisual/lib/energy-detector');
const {
  suggestTargetDurationCuts,
  TARGET_DURATIONS,
} = require('../../packages/audiovisual/lib/smart-cuts');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── parseVolumeOutput ─────────────────────────────────────

describe('parseVolumeOutput', () => {
  test('parses mean_volume from FFmpeg output', () => {
    const output = `[Parsed_volumedetect_0 @ 0x7f9] n_samples: 44100
mean_volume: -23.5 dB
max_volume: -5.2 dB`;
    expect(parseVolumeOutput(output)).toBe(-23.5);
  });

  test('parses negative volume values', () => {
    const output = 'mean_volume: -45.8 dB';
    expect(parseVolumeOutput(output)).toBe(-45.8);
  });

  test('returns null for missing volume data', () => {
    expect(parseVolumeOutput('no volume info here')).toBeNull();
  });

  test('handles zero volume', () => {
    const output = 'mean_volume: 0.0 dB';
    expect(parseVolumeOutput(output)).toBe(0.0);
  });
});

// ── findPeakWindow ────────────────────────────────────────

describe('findPeakWindow', () => {
  test('finds the loudest window', () => {
    const windows = [
      { start: 0, end: 5, meanVolume: -30.0 },
      { start: 5, end: 10, meanVolume: -15.2 },
      { start: 10, end: 15, meanVolume: -22.0 },
      { start: 15, end: 20, meanVolume: -18.5 },
    ];
    const peak = findPeakWindow(windows);
    expect(peak.start).toBe(5);
    expect(peak.meanVolume).toBe(-15.2);
  });

  test('returns first window when all equal', () => {
    const windows = [
      { start: 0, end: 5, meanVolume: -20.0 },
      { start: 5, end: 10, meanVolume: -20.0 },
    ];
    const peak = findPeakWindow(windows);
    expect(peak.start).toBe(0);
  });

  test('returns null for empty windows', () => {
    expect(findPeakWindow([])).toBeNull();
  });

  test('handles single window', () => {
    const windows = [{ start: 0, end: 5, meanVolume: -10.0 }];
    const peak = findPeakWindow(windows);
    expect(peak.start).toBe(0);
    expect(peak.meanVolume).toBe(-10.0);
  });
});

// ── Constants ─────────────────────────────────────────────

describe('Energy Detector Constants', () => {
  test('hook duration is 5 seconds', () => {
    expect(HOOK_DURATION).toBe(5);
  });

  test('window size is 5 seconds', () => {
    expect(WINDOW_SIZE).toBe(5);
  });

  test('window step is 2 seconds for overlap', () => {
    expect(WINDOW_STEP).toBe(2);
  });
});

// ── TARGET_DURATIONS (AV-10 smart-cuts) ───────────────────

describe('TARGET_DURATIONS', () => {
  test('standard duration is 90s', () => {
    expect(TARGET_DURATIONS.standard).toBe(90);
  });

  test('long duration is 120s', () => {
    expect(TARGET_DURATIONS.long).toBe(120);
  });
});

// ── suggestTargetDurationCuts ─────────────────────────────

describe('suggestTargetDurationCuts', () => {
  test('generates cuts near 90s target', () => {
    const blocks = [
      { id: 'b1', type: 'hook', start: 0, end: 10, duration: 10, transcriptExcerpt: 'Inacreditavel segredo', energyLevel: 'high' },
      { id: 'b2', type: 'content', start: 10, end: 50, duration: 40, transcriptExcerpt: 'Experiencia de anos metodo', energyLevel: 'medium' },
      { id: 'b3', type: 'content', start: 50, end: 95, duration: 45, transcriptExcerpt: 'Resultado comprovado funciona', energyLevel: 'medium' },
    ];

    const cuts = suggestTargetDurationCuts(blocks);
    const standardCuts = cuts.filter(c => c.source === 'target-standard');

    expect(standardCuts.length).toBeGreaterThan(0);
    for (const cut of standardCuts) {
      expect(cut.duration).toBeGreaterThanOrEqual(80);
      expect(cut.duration).toBeLessThanOrEqual(100);
      expect(cut.targetDuration).toBe(90);
    }
  });

  test('generates cuts near 120s target', () => {
    const blocks = [
      { id: 'b1', type: 'hook', start: 0, end: 10, duration: 10, transcriptExcerpt: 'Segredo revelacao', energyLevel: 'high' },
      { id: 'b2', type: 'content', start: 10, end: 50, duration: 40, transcriptExcerpt: 'Tutorial passo a passo', energyLevel: 'medium' },
      { id: 'b3', type: 'content', start: 50, end: 90, duration: 40, transcriptExcerpt: 'Experiencia resultado', energyLevel: 'medium' },
      { id: 'b4', type: 'story', start: 90, end: 125, duration: 35, transcriptExcerpt: 'Historia jornada comecei', energyLevel: 'high' },
    ];

    const cuts = suggestTargetDurationCuts(blocks);
    const longCuts = cuts.filter(c => c.source === 'target-long');

    expect(longCuts.length).toBeGreaterThan(0);
    for (const cut of longCuts) {
      expect(cut.duration).toBeGreaterThanOrEqual(110);
      expect(cut.duration).toBeLessThanOrEqual(130);
      expect(cut.targetDuration).toBe(120);
    }
  });

  test('returns empty when blocks too short for targets', () => {
    const blocks = [
      { id: 'b1', type: 'content', start: 0, end: 20, duration: 20, transcriptExcerpt: 'Short', energyLevel: 'low' },
    ];

    const cuts = suggestTargetDurationCuts(blocks);
    expect(cuts).toHaveLength(0);
  });

  test('cut includes all block IDs in range', () => {
    const blocks = [
      { id: 'b1', type: 'hook', start: 0, end: 30, duration: 30, transcriptExcerpt: 'Hook', energyLevel: 'high' },
      { id: 'b2', type: 'content', start: 30, end: 60, duration: 30, transcriptExcerpt: 'Content', energyLevel: 'medium' },
      { id: 'b3', type: 'content', start: 60, end: 92, duration: 32, transcriptExcerpt: 'More content', energyLevel: 'medium' },
    ];

    const cuts = suggestTargetDurationCuts(blocks);
    const standardCuts = cuts.filter(c => c.source === 'target-standard');

    if (standardCuts.length > 0) {
      expect(standardCuts[0].blocks.length).toBeGreaterThanOrEqual(2);
      expect(standardCuts[0].blocks).toContain('b1');
    }
  });

  test('cuts have required fields', () => {
    const blocks = [
      { id: 'b1', type: 'hook', start: 0, end: 30, duration: 30, transcriptExcerpt: 'Segredo inacreditavel', energyLevel: 'high' },
      { id: 'b2', type: 'content', start: 30, end: 65, duration: 35, transcriptExcerpt: 'Tutorial ensinar', energyLevel: 'medium' },
      { id: 'b3', type: 'content', start: 65, end: 95, duration: 30, transcriptExcerpt: 'Resultado metodo', energyLevel: 'medium' },
    ];

    const cuts = suggestTargetDurationCuts(blocks);

    for (const cut of cuts) {
      expect(cut).toHaveProperty('blocks');
      expect(cut).toHaveProperty('start');
      expect(cut).toHaveProperty('end');
      expect(cut).toHaveProperty('duration');
      expect(cut).toHaveProperty('category');
      expect(cut).toHaveProperty('engagementScore');
      expect(cut).toHaveProperty('format');
      expect(cut).toHaveProperty('platform');
      expect(cut).toHaveProperty('source');
      expect(cut).toHaveProperty('targetDuration');
    }
  });
});
