'use strict';

/**
 * Tests for Central Audiovisual — Scale & Output (Phase 5)
 * Stories: AV-5.1, AV-5.2, AV-5.3
 */

const fs = require('fs');
const path = require('path');
const { generateVariations } = require('../../packages/audiovisual/lib/scale');
const { loadQueue, addToQueue, getQueueStatus } = require('../../packages/audiovisual/lib/render-queue');
const { listOutputs, generatePackage } = require('../../packages/audiovisual/lib/output-manager');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── Scale / Variations ──────────────────────────────────────

describe('Scale - generateVariations', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Scale', 'upload', '/test.mp4');
    const projectDir = getProjectDir(testProjectId);

    // Create segments
    const segments = {
      blocks: [
        { id: 'block_001', type: 'hook', start: 0, end: 10, duration: 10, title: 'Hook forte', transcriptExcerpt: 'teste', energyLevel: 'high' },
        { id: 'block_002', type: 'content', start: 12, end: 45, duration: 33, title: 'Conteudo principal', transcriptExcerpt: 'teste', energyLevel: 'medium' },
        { id: 'block_003', type: 'content', start: 47, end: 80, duration: 33, title: 'Segundo conteudo', transcriptExcerpt: 'teste', energyLevel: 'medium' },
        { id: 'block_004', type: 'cta', start: 82, end: 95, duration: 13, title: 'Call to action', transcriptExcerpt: 'teste', energyLevel: 'high' },
      ],
      totalBlocks: 4,
      totalDuration: 95,
    };
    fs.writeFileSync(path.join(projectDir, 'analysis', 'segments.json'), JSON.stringify(segments, null, 2));

    // Create cuts
    const cuts = {
      suggestedCuts: [
        { id: 'cut_001', blocks: ['block_001', 'block_002'], start: 0, end: 45, duration: 45, format: '9:16', platform: ['reels'], category: 'viral', engagementScore: 8.5 },
        { id: 'cut_002', blocks: ['block_002'], start: 12, end: 45, duration: 33, format: '9:16', platform: ['tiktok'], category: 'educativo', engagementScore: 7.2 },
      ],
      totalSuggested: 2,
    };
    fs.mkdirSync(path.join(projectDir, 'cuts'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'cuts', 'suggested-cuts.json'), JSON.stringify(cuts, null, 2));
  });

  test('generates variations', () => {
    const result = generateVariations(testProjectId);
    expect(result.variations.length).toBeGreaterThan(0);
    expect(result.totalVariations).toBe(result.variations.length);

    for (const v of result.variations) {
      expect(v.id).toMatch(/^var_\d{3}$/);
      expect(v.duration).toBeGreaterThan(0);
      expect(v.blocks.length).toBeGreaterThan(0);
    }

    // File saved
    const varFile = path.join(getProjectDir(testProjectId), 'cuts', 'variations.json');
    expect(fs.existsSync(varFile)).toBe(true);
  });

  test('respects max limit', () => {
    const result = generateVariations(testProjectId, { maxVariations: 3 });
    expect(result.variations.length).toBeLessThanOrEqual(3);
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});

// ── Render Queue ────────────────────────────────────────────

describe('Render Queue', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Queue', 'upload', '/test.mp4');
  });

  test('loads empty queue', () => {
    const queue = loadQueue(testProjectId);
    expect(queue.jobs).toHaveLength(0);
  });

  test('adds job to queue', () => {
    const job = addToQueue(testProjectId, 'cut_001', '/path/to/video.mp4', { quality: 'high' });
    expect(job.id).toBeTruthy();
    expect(job.cutId).toBe('cut_001');
    expect(job.status).toBe('queued');
    expect(job.quality).toBe('high');
  });

  test('adds multiple jobs', () => {
    addToQueue(testProjectId, 'cut_002', '/path/to/video2.mp4');
    const status = getQueueStatus(testProjectId);
    expect(status.total).toBe(2);
    expect(status.queued).toBe(2);
    expect(status.rendered).toBe(0);
  });

  test('gets queue status', () => {
    const status = getQueueStatus(testProjectId);
    expect(status).toHaveProperty('total');
    expect(status).toHaveProperty('queued');
    expect(status).toHaveProperty('rendering');
    expect(status).toHaveProperty('rendered');
    expect(status).toHaveProperty('error');
    expect(status).toHaveProperty('jobs');
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});

// ── Output Manager ──────────────────────────────────────────

describe('Output Manager', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Output', 'upload', '/test.mp4');
    const projectDir = getProjectDir(testProjectId);

    // Create a fake output file
    const outputDir = path.join(projectDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'final-cut_001.mp4'), 'fake video data');

    // Create cuts
    const cuts = {
      suggestedCuts: [
        { id: 'cut_001', category: 'viral', platform: ['reels'], format: '9:16', duration: 30, engagementScore: 8.0 },
      ],
    };
    fs.mkdirSync(path.join(projectDir, 'cuts'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'cuts', 'suggested-cuts.json'), JSON.stringify(cuts, null, 2));
  });

  test('lists outputs', () => {
    const outputs = listOutputs(testProjectId);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].filename).toBe('final-cut_001.mp4');
    expect(outputs[0].cutId).toBe('cut_001');
  });

  test('generates package', () => {
    const pkg = generatePackage(testProjectId);
    expect(pkg.totalOutputs).toBe(1);
    expect(pkg.outputs[0].category).toBe('viral');
    expect(pkg.outputs[0].platform).toContain('reels');

    // File saved
    const pkgFile = path.join(getProjectDir(testProjectId), 'output', 'package.json');
    expect(fs.existsSync(pkgFile)).toBe(true);
  });

  test('returns empty for no outputs', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    const outputs = listOutputs(emptyId);
    expect(outputs).toHaveLength(0);
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});
