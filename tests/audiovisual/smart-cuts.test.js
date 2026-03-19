'use strict';

/**
 * Tests for Central Audiovisual — Smart Cuts
 * Story: AV-3.1
 */

const fs = require('fs');
const path = require('path');
const {
  detectCategory,
  calculateEngagementScore,
  generateObjective,
  deduplicateCuts,
  generateSmartCuts,
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
});

// ── calculateEngagementScore ────────────────────────────────

describe('calculateEngagementScore', () => {
  test('high energy viral gets high score', () => {
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
});

// ── generateObjective ───────────────────────────────────────

describe('generateObjective', () => {
  test('returns objective for each category', () => {
    expect(generateObjective('viral')).toContain('impacto');
    expect(generateObjective('educativo')).toContain('Ensinar');
    expect(generateObjective('cta')).toContain('Conversao');
  });
});

// ── deduplicateCuts ─────────────────────────────────────────

describe('deduplicateCuts', () => {
  test('removes duplicate cuts with similar timestamps', () => {
    const cuts = [
      { start: 0, end: 30, category: 'viral' },
      { start: 0.5, end: 30.5, category: 'viral' },
      { start: 45, end: 75, category: 'educativo' },
    ];
    const unique = deduplicateCuts(cuts);
    expect(unique).toHaveLength(2);
  });

  test('keeps cuts with different timestamps', () => {
    const cuts = [
      { start: 0, end: 30, category: 'viral' },
      { start: 40, end: 70, category: 'educativo' },
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
        { id: 'block_001', type: 'hook', start: 0, end: 8, duration: 8, transcriptExcerpt: 'Voce sabia que isso e inacreditavel segredo revelacao', energyLevel: 'high', wordCount: 8 },
        { id: 'block_002', type: 'content', start: 10, end: 40, duration: 30, transcriptExcerpt: 'Vou ensinar como fazer passo a passo tutorial dica truque', energyLevel: 'medium', wordCount: 50 },
        { id: 'block_003', type: 'content', start: 42, end: 80, duration: 38, transcriptExcerpt: 'Com minha experiencia de anos resultado metodo funciona', energyLevel: 'medium', wordCount: 60 },
        { id: 'block_004', type: 'story', start: 82, end: 120, duration: 38, transcriptExcerpt: 'Uma vez aconteceu comigo quando eu historia jornada', energyLevel: 'high', wordCount: 40 },
        { id: 'block_005', type: 'cta', start: 122, end: 140, duration: 18, transcriptExcerpt: 'Se inscreve link na descricao compre agora garanta', energyLevel: 'medium', wordCount: 15 },
        { id: 'block_006', type: 'outro', start: 142, end: 155, duration: 13, transcriptExcerpt: 'Valeu galera forte abraco ate o proximo', energyLevel: 'low', wordCount: 8 },
      ],
      totalBlocks: 6,
      totalDuration: 155,
    };

    const analysisDir = path.join(getProjectDir(testProjectId), 'analysis');
    fs.writeFileSync(path.join(analysisDir, 'segments.json'), JSON.stringify(segments, null, 2));
  });

  test('generates smart cuts', () => {
    const result = generateSmartCuts(testProjectId);

    expect(result.suggestedCuts.length).toBeGreaterThan(0);
    expect(result.totalSuggested).toBe(result.suggestedCuts.length);

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
