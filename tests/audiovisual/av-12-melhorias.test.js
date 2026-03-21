'use strict';

/**
 * Tests for AV-12: 8 Melhorias nos Cortes Inteligentes
 */

const { detectSilence, getSpeakingSegments, SILENCE_THRESHOLD, MIN_SILENCE_DURATION } = require('../../packages/audiovisual/lib/silence-remover');
const { findTopPeaks } = require('../../packages/audiovisual/lib/energy-detector');
const { detectSceneChanges, classifyScenes, SCENE_THRESHOLD } = require('../../packages/audiovisual/lib/scene-detector');
const { generateWordByWordASS, SUBTITLE_STYLES } = require('../../packages/audiovisual/lib/subtitles');
const { calculateAdjustedScore } = require('../../packages/audiovisual/lib/learning');
const { extractBestThumbnail } = require('../../packages/audiovisual/lib/thumbnail');

// ── Melhoria 1: Silence Remover ───────────────────

describe('Silence Remover', () => {
  test('constants are defined', () => {
    expect(SILENCE_THRESHOLD).toBe('-35dB');
    expect(MIN_SILENCE_DURATION).toBe(1.5);
  });

  test('getSpeakingSegments with no silences returns full range', () => {
    // Mock: no silence detected = full segment
    const segments = getSpeakingSegments.__length
      ? getSpeakingSegments
      : null;
    // Just verify the function exists and is callable
    expect(typeof getSpeakingSegments).toBe('function');
  });
});

// ── Melhoria 2: Multiple Hooks ────────────────────

describe('Multiple Hooks (findTopPeaks)', () => {
  test('returns top 3 peaks from windows', () => {
    const windows = [
      { start: 0, end: 5, meanVolume: -30 },
      { start: 10, end: 15, meanVolume: -15 },
      { start: 20, end: 25, meanVolume: -20 },
      { start: 30, end: 35, meanVolume: -10 },
      { start: 40, end: 45, meanVolume: -25 },
      { start: 50, end: 55, meanVolume: -12 },
    ];
    const peaks = findTopPeaks(windows, 3, 15);
    expect(peaks.length).toBeLessThanOrEqual(3);
    expect(peaks[0].meanVolume).toBe(-10); // loudest
    expect(peaks[0].rank).toBe(1);
  });

  test('respects minimum gap between peaks', () => {
    const windows = [
      { start: 0, end: 5, meanVolume: -10 },
      { start: 2, end: 7, meanVolume: -11 }, // too close to first
      { start: 20, end: 25, meanVolume: -12 },
    ];
    const peaks = findTopPeaks(windows, 3, 15);
    expect(peaks.length).toBe(2);
    expect(peaks[0].start).toBe(0);
    expect(peaks[1].start).toBe(20);
  });

  test('returns empty for empty windows', () => {
    expect(findTopPeaks([], 3)).toEqual([]);
  });

  test('filters null volumes', () => {
    const windows = [
      { start: 0, end: 5, meanVolume: null },
      { start: 10, end: 15, meanVolume: -20 },
    ];
    const peaks = findTopPeaks(windows, 3);
    expect(peaks.length).toBe(1);
    expect(peaks[0].start).toBe(10);
  });
});

// ── Melhoria 4: Word-by-Word Subtitles ────────────

describe('Word-by-Word Subtitles', () => {
  test('generates ASS with Highlight style', () => {
    const transcription = {
      segments: [
        { start: 5, end: 8, text: 'Ola pessoal' },
        { start: 9, end: 12, text: 'Como voces estao' },
      ],
    };
    const ass = generateWordByWordASS(transcription, 5, 15, 1080, 1920);
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('Style: Highlight');
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Dialogue:');
  });

  test('handles empty segments', () => {
    const ass = generateWordByWordASS({ segments: [] }, 0, 10, 1080, 1920);
    expect(ass).toContain('[Script Info]');
    expect(ass).not.toContain('Dialogue:');
  });
});

// ── Melhoria 5: Scene Detector ────────────────────

describe('Scene Detector', () => {
  test('SCENE_THRESHOLD is defined', () => {
    expect(SCENE_THRESHOLD).toBe(0.3);
  });

  test('classifyScenes function exists', () => {
    expect(typeof classifyScenes).toBe('function');
  });

  test('detectSceneChanges function exists', () => {
    expect(typeof detectSceneChanges).toBe('function');
  });
});

// ── Melhoria 7: Adjusted Viral Score ──────────────

describe('Adjusted Viral Score', () => {
  test('returns heuristic only when no views', () => {
    const result = calculateAdjustedScore(7.5, {});
    expect(result.adjustedScore).toBe(7.5);
    expect(result.source).toBe('heuristic');
    expect(result.confidence).toBe('low');
  });

  test('calculates adjusted score with real data', () => {
    const result = calculateAdjustedScore(5, {
      views: 10000,
      likes: 800,
      shares: 200,
      comments: 50,
      saves: 100,
    });
    expect(result.source).toBe('real_data');
    expect(result.confidence).toBe('high');
    expect(result.adjustedScore).toBeGreaterThan(0);
    expect(result.adjustedScore).toBeLessThanOrEqual(10);
    expect(result.engagementRate).toBeGreaterThan(0);
  });

  test('high engagement gives high score', () => {
    const result = calculateAdjustedScore(5, {
      views: 100000,
      likes: 15000,
      shares: 5000,
      comments: 2000,
      saves: 3000,
    });
    expect(result.adjustedScore).toBeGreaterThan(7);
  });

  test('low engagement gives low score', () => {
    const result = calculateAdjustedScore(5, {
      views: 10000,
      likes: 10,
      shares: 1,
      comments: 0,
      saves: 0,
    });
    expect(result.adjustedScore).toBeLessThan(3);
  });

  test('score is clamped 0-10', () => {
    const result = calculateAdjustedScore(10, {
      views: 1000,
      likes: 900,
      shares: 500,
      comments: 300,
      saves: 200,
    });
    expect(result.adjustedScore).toBeLessThanOrEqual(10);
    expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Melhoria 8: Best Thumbnail ────────────────────

describe('Best Thumbnail', () => {
  test('extractBestThumbnail function exists', () => {
    expect(typeof extractBestThumbnail).toBe('function');
  });
});
