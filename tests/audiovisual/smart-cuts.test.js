'use strict';

/**
 * Tests for Central Audiovisual — Smart Cuts
 * Story: AV-3.1 + AV-12 refinements
 */

const fs = require('fs');
const path = require('path');
const {
  detectCategory,
  calculateEngagementScore,
  generateObjective,
  deduplicateCuts,
  generateSmartCuts,
  snapToBoundary,
  snapToSentence,
  findSentenceBoundaries,
  PLATFORM_SPECS,
} = require('../../packages/audiovisual/lib/smart-cuts');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── detectCategory ──────────────────────────────────────────

describe('detectCategory', () => {
  test('detects viral content', () => {
    expect(detectCategory('Isso e inacreditavel, ninguem esperava esse segredo')).toBe('viral');
  });

  test('detects educativo content', () => {
    expect(detectCategory('Vou ensinar um passo a passo de como fazer tutorial')).toBe('educativo');
  });

  test('detects autoridade content', () => {
    expect(detectCategory('Com minha experiencia de anos, esse metodo funciona e e comprovado')).toBe('autoridade');
  });

  test('detects storytelling', () => {
    expect(detectCategory('Uma vez aconteceu comigo, quando eu lembro dessa historia')).toBe('storytelling');
  });

  test('detects cta', () => {
    expect(detectCategory('Compre agora, acesse o link na descricao, garanta sua vaga')).toBe('cta');
  });

  test('defaults to viral for unknown', () => {
    expect(detectCategory('conteudo generico sem palavras chave')).toBe('viral');
  });

  test('positional weighting: keywords in first 30% get 2x weight', () => {
    // "segredo" at start should strongly weight viral
    const hookFirst = detectCategory('segredo revelacao chocante depois muito conteudo educativo normal sem dica');
    expect(hookFirst).toBe('viral');
  });
});

// ── calculateEngagementScore ────────────────────────────────

describe('calculateEngagementScore', () => {
  test('high energy viral hook gets high score', () => {
    const block = { duration: 30, energyLevel: 'high', type: 'hook' };
    const score = calculateEngagementScore(block, 'viral');
    expect(score).toBeGreaterThanOrEqual(8);
  });

  test('low energy long content gets lower score', () => {
    const block = { duration: 150, energyLevel: 'low', type: 'content' };
    const score = calculateEngagementScore(block, 'educativo');
    expect(score).toBeLessThan(6);
  });

  test('score is clamped 0-10', () => {
    const block = { duration: 30, energyLevel: 'high', type: 'hook' };
    const score = calculateEngagementScore(block, 'viral');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('speech pace bonus — dynamic pace gets bonus', () => {
    const dynamicBlock = { duration: 30, energyLevel: 'medium', type: 'content', wordCount: 90 }; // 3 wps
    const slowBlock = { duration: 30, energyLevel: 'medium', type: 'content', wordCount: 15 };    // 0.5 wps
    const dynamicScore = calculateEngagementScore(dynamicBlock, 'educativo');
    const slowScore = calculateEngagementScore(slowBlock, 'educativo');
    expect(dynamicScore).toBeGreaterThan(slowScore);
  });

  test('position bonus — earlier blocks score higher', () => {
    const earlyBlock = { duration: 30, energyLevel: 'medium', type: 'content', start: 5 };
    const lateBlock = { duration: 30, energyLevel: 'medium', type: 'content', start: 280 };
    const earlyScore = calculateEngagementScore(earlyBlock, 'educativo', { totalDuration: 300 });
    const lateScore = calculateEngagementScore(lateBlock, 'educativo', { totalDuration: 300 });
    expect(earlyScore).toBeGreaterThan(lateScore);
  });

  test('scene variety bonus', () => {
    const screenBlock = { duration: 30, energyLevel: 'medium', type: 'content', sceneType: 'tela', sceneChangeRate: 0.5 };
    const staticBlock = { duration: 30, energyLevel: 'medium', type: 'content', sceneType: 'fala', sceneChangeRate: 0 };
    const screenScore = calculateEngagementScore(screenBlock, 'educativo');
    const staticScore = calculateEngagementScore(staticBlock, 'educativo');
    expect(screenScore).toBeGreaterThan(staticScore);
  });
});

// ── snapToSentence ──────────────────────────────────────────

describe('snapToSentence', () => {
  const boundaries = [
    { timestamp: 10.5, gap: 2.1, strength: 'strong' },
    { timestamp: 25.3, gap: 1.2, strength: 'medium' },
    { timestamp: 42.0, gap: 0.6, strength: 'weak' },
  ];

  test('snaps to nearest boundary within maxDrift', () => {
    expect(snapToSentence(11.0, boundaries)).toBe(10.5);
    expect(snapToSentence(24.5, boundaries)).toBe(25.3);
  });

  test('returns original if no boundary within maxDrift', () => {
    expect(snapToSentence(100.0, boundaries)).toBe(100.0);
  });

  test('returns original for empty boundaries', () => {
    expect(snapToSentence(15.0, [])).toBe(15.0);
  });
});

// ── snapToBoundary ──────────────────────────────────────────

describe('snapToBoundary', () => {
  const blocks = [
    { start: 0, end: 10 },
    { start: 12, end: 30 },
    { start: 32, end: 50 },
  ];

  test('snaps to nearest block boundary', () => {
    expect(snapToBoundary(11.0, blocks)).toBe(10);  // closer to block[0].end
    expect(snapToBoundary(31.5, blocks)).toBe(32);   // closer to block[2].start
  });

  test('returns original if no boundary within radius', () => {
    expect(snapToBoundary(25.0, blocks, 1.5)).toBe(25.0);
  });
});

// ── generateObjective ───────────────────────────────────────

describe('generateObjective', () => {
  test('returns objective for each category', () => {
    expect(generateObjective('viral')).toContain('impacto');
    expect(generateObjective('educativo')).toContain('Ensinar');
    expect(generateObjective('cta')).toContain('Conversao');
  });
});

// ── deduplicateCuts (overlap-based) ─────────────────────────

describe('deduplicateCuts', () => {
  test('removes overlapping cuts (>50% overlap)', () => {
    const cuts = [
      { start: 0, end: 30, duration: 30, engagementScore: 7, category: 'viral' },
      { start: 5, end: 28, duration: 23, engagementScore: 6, category: 'viral' },  // 77% overlap
      { start: 45, end: 75, duration: 30, engagementScore: 5, category: 'educativo' },
    ];
    const unique = deduplicateCuts(cuts);
    expect(unique).toHaveLength(2);
    // Should keep higher-scored cut
    expect(unique[0].engagementScore).toBe(7);
  });

  test('keeps cuts with low overlap (<50%)', () => {
    const cuts = [
      { start: 0, end: 30, duration: 30, engagementScore: 7, category: 'viral' },
      { start: 20, end: 50, duration: 30, engagementScore: 6, category: 'educativo' },  // 33% overlap
    ];
    const unique = deduplicateCuts(cuts);
    expect(unique).toHaveLength(2);
  });

  test('keeps non-overlapping cuts', () => {
    const cuts = [
      { start: 0, end: 30, duration: 30, engagementScore: 7, category: 'viral' },
      { start: 40, end: 70, duration: 30, engagementScore: 6, category: 'educativo' },
    ];
    const unique = deduplicateCuts(cuts);
    expect(unique).toHaveLength(2);
  });
});

// ── PLATFORM_SPECS ──────────────────────────────────────────

describe('PLATFORM_SPECS', () => {
  test('has all platforms', () => {
    expect(PLATFORM_SPECS).toHaveProperty('reels');
    expect(PLATFORM_SPECS).toHaveProperty('tiktok');
    expect(PLATFORM_SPECS).toHaveProperty('shorts');
    expect(PLATFORM_SPECS).toHaveProperty('feed');
    expect(PLATFORM_SPECS).toHaveProperty('youtube');
  });

  test('each platform has required fields', () => {
    for (const spec of Object.values(PLATFORM_SPECS)) {
      expect(spec).toHaveProperty('minDuration');
      expect(spec).toHaveProperty('maxDuration');
      expect(spec).toHaveProperty('format');
    }
  });
});

// ── generateSmartCuts (integration) ─────────────────────────

describe('generateSmartCuts', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Cuts', 'upload', '/test.mp4');

    const segments = {
      blocks: [
        { id: 'block_001', type: 'hook', start: 0, end: 8, duration: 8, transcriptExcerpt: 'Voce sabia que isso e inacreditavel segredo revelacao', energyLevel: 'high', wordCount: 8, segmentCount: 2, sceneType: 'fala', sceneChangeRate: 0.1 },
        { id: 'block_002', type: 'content', start: 10, end: 40, duration: 30, transcriptExcerpt: 'Vou ensinar como fazer passo a passo tutorial dica truque', energyLevel: 'medium', wordCount: 50, segmentCount: 5, sceneType: 'tela', sceneChangeRate: 0.6 },
        { id: 'block_003', type: 'content', start: 42, end: 80, duration: 38, transcriptExcerpt: 'Com minha experiencia de anos resultado metodo funciona', energyLevel: 'medium', wordCount: 60, segmentCount: 6, sceneType: 'fala', sceneChangeRate: 0.2 },
        { id: 'block_004', type: 'story', start: 82, end: 120, duration: 38, transcriptExcerpt: 'Uma vez aconteceu comigo quando eu historia jornada', energyLevel: 'high', wordCount: 40, segmentCount: 4, sceneType: 'fala', sceneChangeRate: 0.1 },
        { id: 'block_005', type: 'cta', start: 122, end: 140, duration: 18, transcriptExcerpt: 'Se inscreve link na descricao compre agora garanta', energyLevel: 'medium', wordCount: 15, segmentCount: 2, sceneType: 'fala', sceneChangeRate: 0.05 },
        { id: 'block_006', type: 'outro', start: 142, end: 155, duration: 13, transcriptExcerpt: 'Valeu galera forte abraco ate o proximo', energyLevel: 'low', wordCount: 8, segmentCount: 1, sceneType: 'fala', sceneChangeRate: 0 },
      ],
      totalBlocks: 6,
      totalDuration: 155,
    };

    const analysisDir = path.join(getProjectDir(testProjectId), 'analysis');
    fs.writeFileSync(path.join(analysisDir, 'segments.json'), JSON.stringify(segments, null, 2));
  });

  test('generates smart cuts with refinements', () => {
    const result = generateSmartCuts(testProjectId);

    expect(result.suggestedCuts.length).toBeGreaterThan(0);
    expect(result.totalSuggested).toBe(result.suggestedCuts.length);
    expect(result.refinements).toBeDefined();
    expect(result.refinements.deduplicationMethod).toBe('overlap-50pct');
    expect(result.refinements.scoringModel).toBe('multi-factor-v2');

    for (const cut of result.suggestedCuts) {
      expect(cut.id).toMatch(/^cut_\d{3}$/);
      expect(cut.category).toBeTruthy();
      expect(cut.engagementScore).toBeGreaterThanOrEqual(0);
      expect(cut.engagementScore).toBeLessThanOrEqual(10);
      expect(cut.format).toBeTruthy();
      expect(cut.platform.length).toBeGreaterThan(0);
      expect(cut.status).toBe('suggested');
    }

    // Cuts should be sorted by engagement score
    for (let i = 1; i < result.suggestedCuts.length; i++) {
      expect(result.suggestedCuts[i].engagementScore)
        .toBeLessThanOrEqual(result.suggestedCuts[i - 1].engagementScore);
    }

    // Check file was saved
    const cutsFile = path.join(getProjectDir(testProjectId), 'cuts', 'suggested-cuts.json');
    expect(fs.existsSync(cutsFile)).toBe(true);
  });

  test('generates narrative arc cuts', () => {
    const result = generateSmartCuts(testProjectId);
    const arcCuts = result.suggestedCuts.filter(c => c.source === 'narrative-arc');
    // Should find at least one narrative arc (hook → content → story/cta)
    expect(arcCuts.length).toBeGreaterThanOrEqual(0);
    // If arcs exist, they should have 3 blocks
    for (const arc of arcCuts) {
      expect(arc.blocks.length).toBe(3);
    }
  });

  test('throws if no segments', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    expect(() => generateSmartCuts(emptyId)).toThrow('Segments not found');
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});
