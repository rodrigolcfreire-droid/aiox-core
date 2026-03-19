'use strict';

/**
 * Tests for Central Audiovisual — Video Segmentation
 * Story: AV-2.3
 */

const fs = require('fs');
const path = require('path');
const {
  segmentVideo,
  classifyBlockType,
  estimateEnergyLevel,
  normalizeText,
  generateTitle,
} = require('../../packages/audiovisual/lib/segment');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── classifyBlockType ───────────────────────────────────────

describe('classifyBlockType', () => {
  test('detects hook at start', () => {
    expect(classifyBlockType('Voce sabia que isso muda tudo?', 0, 5)).toBe('hook');
  });

  test('defaults to intro at position 0', () => {
    expect(classifyBlockType('Vamos comecar o conteudo', 0, 5)).toBe('intro');
  });

  test('detects CTA keywords', () => {
    expect(classifyBlockType('Se inscreve no canal e ativa o sininho', 2, 5)).toBe('cta');
  });

  test('detects story keywords', () => {
    expect(classifyBlockType('Uma vez na minha vida aconteceu algo incrivel', 2, 5)).toBe('story');
  });

  test('defaults to outro at last position', () => {
    expect(classifyBlockType('Foi isso, conteudo do dia', 4, 5)).toBe('outro');
  });

  test('defaults to content for middle blocks', () => {
    expect(classifyBlockType('Explicando como funciona o processo', 2, 5)).toBe('content');
  });
});

// ── estimateEnergyLevel ─────────────────────────────────────

describe('estimateEnergyLevel', () => {
  test('high energy for fast speech', () => {
    const segments = [
      { start: 0, end: 2, text: 'muitas palavras rapidas sendo faladas com velocidade muito alta em pouco tempo' },
    ];
    expect(estimateEnergyLevel(segments)).toBe('high');
  });

  test('low energy for slow speech', () => {
    const segments = [
      { start: 0, end: 10, text: 'poucas palavras' },
    ];
    expect(estimateEnergyLevel(segments)).toBe('low');
  });

  test('medium energy for normal speech', () => {
    const segments = [
      { start: 0, end: 5, text: 'uma frase normal com velocidade media de fala' },
    ];
    expect(estimateEnergyLevel(segments)).toBe('medium');
  });

  test('handles empty segments', () => {
    expect(estimateEnergyLevel([])).toBe('medium');
  });
});

// ── normalizeText ───────────────────────────────────────────

describe('normalizeText', () => {
  test('lowercases and removes accents', () => {
    expect(normalizeText('Olá Mundo!')).toBe('ola mundo');
  });

  test('removes punctuation', () => {
    expect(normalizeText('Isso é, um teste!')).toBe('isso e um teste');
  });
});

// ── generateTitle ───────────────────────────────────────────

describe('generateTitle', () => {
  test('truncates long text', () => {
    const text = 'uma frase muito longa com diversas palavras que precisa ser cortada para caber';
    const title = generateTitle(text);
    expect(title.split(' ').length).toBeLessThanOrEqual(9); // 8 words + ...
    expect(title).toContain('...');
  });

  test('keeps short text as is', () => {
    expect(generateTitle('texto curto')).toBe('texto curto');
  });
});

// ── segmentVideo (integration) ──────────────────────────────

describe('segmentVideo', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Segment', 'upload', '/test.mp4');

    // Create mock transcription
    const transcription = {
      segments: [
        { start: 0, end: 3, text: 'Fala galera bem vindos ao video de hoje', confidence: 0.95 },
        { start: 3.2, end: 6, text: 'Hoje eu vou falar sobre algo importante', confidence: 0.92 },
        { start: 6.1, end: 10, text: 'Voce sabia que isso muda tudo na sua vida', confidence: 0.90 },
        // Long pause — new block
        { start: 14, end: 18, text: 'Entao vamos ao conteudo principal do dia', confidence: 0.93 },
        { start: 18.5, end: 22, text: 'Primeiro ponto que precisamos entender', confidence: 0.91 },
        { start: 22.3, end: 26, text: 'Segundo ponto muito relevante', confidence: 0.89 },
        // Long pause — new block
        { start: 30, end: 33, text: 'Se inscreve no canal e ativa o sininho', confidence: 0.94 },
        { start: 33.5, end: 37, text: 'Ate o proximo video forte abraco', confidence: 0.92 },
      ],
      totalDuration: 37,
      language: 'pt',
      totalWords: 60,
    };

    const analysisDir = path.join(getProjectDir(testProjectId), 'analysis');
    fs.writeFileSync(
      path.join(analysisDir, 'transcription.json'),
      JSON.stringify(transcription, null, 2)
    );
  });

  test('segments video into blocks', () => {
    const result = segmentVideo(testProjectId);

    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
    expect(result.totalBlocks).toBe(result.blocks.length);
    expect(result.totalDuration).toBe(37);

    // Each block has required fields
    for (const block of result.blocks) {
      expect(block.id).toMatch(/^block_\d{3}$/);
      expect(block.type).toBeTruthy();
      expect(typeof block.start).toBe('number');
      expect(typeof block.end).toBe('number');
      expect(block.duration).toBeGreaterThan(0);
      expect(block.title).toBeTruthy();
      expect(block.energyLevel).toMatch(/^(high|medium|low)$/);
    }

    // Check segments.json was saved
    const segFile = path.join(getProjectDir(testProjectId), 'analysis', 'segments.json');
    expect(fs.existsSync(segFile)).toBe(true);
  });

  test('throws if no transcription', () => {
    const emptyProjectId = generateProjectId();
    createProjectStructure(emptyProjectId, 'Empty', 'upload', '/test.mp4');
    expect(() => segmentVideo(emptyProjectId)).toThrow('Transcription not found');
    // Cleanup
    fs.rmSync(getProjectDir(emptyProjectId), { recursive: true, force: true });
  });

  afterAll(() => {
    const projectDir = getProjectDir(testProjectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
