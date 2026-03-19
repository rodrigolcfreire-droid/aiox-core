'use strict';

/**
 * Tests for AV-8: Missing Features
 * Brand Catalog, Suggestions, Performance, Batch
 */

const fs = require('fs');
const path = require('path');

// Brand Catalog
const { addBrand, updateBrand, removeBrand, getBrand, listBrands, slugify, loadCatalog, CATALOG_PATH } = require('../../packages/audiovisual/lib/brand-catalog');

// Suggestions
const { generateSuggestions, analyzeHook, analyzeRitmo, analyzeEstrutura, SUGGESTION_TYPES } = require('../../packages/audiovisual/lib/suggestions');

// Performance
const { registerMetrics, analyzePerformance, loadProjectMetrics } = require('../../packages/audiovisual/lib/performance');

// Batch
const { findVideosInDir } = require('../../packages/audiovisual/lib/batch');

const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── Brand Catalog ───────────────────────────────────────────

describe('Brand Catalog', () => {
  beforeAll(() => {
    // Clean catalog for tests
    if (fs.existsSync(CATALOG_PATH)) fs.unlinkSync(CATALOG_PATH);
  });

  afterAll(() => {
    if (fs.existsSync(CATALOG_PATH)) fs.unlinkSync(CATALOG_PATH);
  });

  test('slugify converts name to slug', () => {
    expect(slugify('Caio Roleta')).toBe('caio-roleta');
    expect(slugify('Reals +')).toBe('reals');
    expect(slugify('Ação Imediata')).toBe('acao-imediata');
  });

  test('adds a brand', () => {
    const brand = addBrand('Reals', { logo: '/logos/reals.png', subtitleStyle: 'bold' });
    expect(brand.slug).toBe('reals');
    expect(brand.logo).toBe('/logos/reals.png');
    expect(brand.subtitleStyle).toBe('bold');
  });

  test('adds second brand', () => {
    const brand = addBrand('Bingo Casino', { overlay18: true });
    expect(brand.slug).toBe('bingo-casino');
    expect(brand.overlay18).toBe(true);
  });

  test('lists brands', () => {
    const brands = listBrands();
    expect(brands).toHaveLength(2);
  });

  test('gets brand by slug', () => {
    const brand = getBrand('reals');
    expect(brand.name).toBe('Reals');
  });

  test('updates brand', () => {
    const brand = updateBrand('reals', { logoPosition: 'bottom-left' });
    expect(brand.logoPosition).toBe('bottom-left');
  });

  test('removes brand', () => {
    removeBrand('bingo-casino');
    const brands = listBrands();
    expect(brands).toHaveLength(1);
  });

  test('throws on duplicate brand', () => {
    expect(() => addBrand('Reals')).toThrow('already exists');
  });

  test('throws on missing brand', () => {
    expect(() => getBrand('nonexistent')).toThrow('not found');
  });
});

// ── Suggestions ─────────────────────────────────────────────

describe('Suggestions Engine', () => {
  test('analyzeHook detects long hook', () => {
    const blocks = [{ type: 'hook', duration: 12, energyLevel: 'high' }];
    const suggestions = analyzeHook(blocks);
    expect(suggestions.some(s => s.type === SUGGESTION_TYPES.HOOK)).toBe(true);
  });

  test('analyzeHook detects missing hook', () => {
    const blocks = [{ type: 'intro', duration: 5, energyLevel: 'medium' }];
    const suggestions = analyzeHook(blocks);
    expect(suggestions.some(s => s.message.includes('sem hook'))).toBe(true);
  });

  test('analyzeRitmo detects monotone energy', () => {
    const blocks = [
      { energyLevel: 'medium', duration: 10 },
      { energyLevel: 'medium', duration: 10 },
      { energyLevel: 'medium', duration: 10 },
    ];
    const suggestions = analyzeRitmo(blocks);
    expect(suggestions.some(s => s.type === SUGGESTION_TYPES.RITMO)).toBe(true);
  });

  test('analyzeEstrutura detects missing CTA', () => {
    const blocks = [
      { type: 'hook' }, { type: 'content' }, { type: 'outro' },
    ];
    const suggestions = analyzeEstrutura(blocks);
    expect(suggestions.some(s => s.message.includes('CTA'))).toBe(true);
  });

  test('generateSuggestions works with project', () => {
    const id = generateProjectId();
    createProjectStructure(id, 'Test Suggest', 'upload', '/test.mp4');
    const projectDir = getProjectDir(id);

    // Create segments
    const segments = {
      blocks: [
        { id: 'b1', type: 'intro', start: 0, end: 15, duration: 15, energyLevel: 'low', transcriptExcerpt: 'ola' },
        { id: 'b2', type: 'content', start: 16, end: 50, duration: 34, energyLevel: 'low', transcriptExcerpt: 'conteudo' },
        { id: 'b3', type: 'outro', start: 51, end: 60, duration: 9, energyLevel: 'low', transcriptExcerpt: 'tchau' },
      ],
      totalBlocks: 3, totalDuration: 60,
    };
    fs.writeFileSync(path.join(projectDir, 'analysis', 'segments.json'), JSON.stringify(segments));

    const result = generateSuggestions(id);
    expect(result.totalSuggestions).toBeGreaterThan(0);
    expect(result.suggestions[0]).toHaveProperty('type');
    expect(result.suggestions[0]).toHaveProperty('priority');
    expect(result.suggestions[0]).toHaveProperty('message');
    expect(result.suggestions[0]).toHaveProperty('action');

    fs.rmSync(getProjectDir(id), { recursive: true, force: true });
  });
});

// ── Performance ─────────────────────────────────────────────

describe('Performance Analytics', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Perf', 'upload', '/test.mp4');
    const projectDir = getProjectDir(testProjectId);

    // Create cuts
    const cuts = {
      suggestedCuts: [
        { id: 'cut_001', category: 'viral', duration: 30, format: '9:16', engagementScore: 8.5, platform: ['reels'] },
        { id: 'cut_002', category: 'educativo', duration: 45, format: '9:16', engagementScore: 6.0, platform: ['tiktok'] },
      ],
    };
    fs.mkdirSync(path.join(projectDir, 'cuts'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'cuts', 'suggested-cuts.json'), JSON.stringify(cuts));
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });

  test('registers metrics', () => {
    const entry = registerMetrics(testProjectId, 'cut_001', {
      views: 5000, likes: 250, shares: 50, retention: 72, platform: 'reels',
    });
    expect(entry.views).toBe(5000);
    expect(entry.category).toBe('viral');
  });

  test('registers second metrics', () => {
    const entry = registerMetrics(testProjectId, 'cut_002', {
      views: 1200, likes: 40, shares: 5, retention: 45, platform: 'tiktok',
    });
    expect(entry.views).toBe(1200);
  });

  test('loads project metrics', () => {
    const metrics = loadProjectMetrics(testProjectId);
    expect(metrics.metrics).toHaveLength(2);
  });

  test('analyzes performance', () => {
    const result = analyzePerformance(testProjectId);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.ranking).toHaveLength(2);
    expect(result.ranking[0].views).toBeGreaterThanOrEqual(result.ranking[1].views);
  });

  test('returns empty for no metrics', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    const result = analyzePerformance(emptyId);
    expect(result.insights).toHaveLength(0);
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });
});

// ── Batch ───────────────────────────────────────────────────

describe('Batch Processing', () => {
  test('findVideosInDir finds video files', () => {
    const tempDir = path.join(getProjectDir(generateProjectId()), '..', '_batch_test');
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'video1.mp4'), 'fake');
    fs.writeFileSync(path.join(tempDir, 'video2.mov'), 'fake');
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'fake');

    const videos = findVideosInDir(tempDir);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toContain('video1.mp4');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('findVideosInDir throws on missing dir', () => {
    expect(() => findVideosInDir('/nonexistent')).toThrow('Directory not found');
  });
});
