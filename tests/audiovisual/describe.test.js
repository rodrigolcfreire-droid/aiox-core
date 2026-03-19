'use strict';

/**
 * Tests for Central Audiovisual — Content Description
 * Story: AV-3.2
 */

const fs = require('fs');
const path = require('path');
const {
  extractKeywords,
  extractTopics,
  generateSummary,
  suggestTitles,
  capitalize,
  generateDescription,
} = require('../../packages/audiovisual/lib/describe');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── extractKeywords ─────────────────────────────────────────

describe('extractKeywords', () => {
  test('extracts keywords sorted by frequency', () => {
    const text = 'marketing digital e importante para marketing online e marketing de conteudo';
    const keywords = extractKeywords(text);
    expect(keywords[0].word).toBe('marketing');
    expect(keywords[0].count).toBe(3);
  });

  test('filters stop words', () => {
    const text = 'eu tenho uma casa muito grande para voce';
    const keywords = extractKeywords(text);
    const words = keywords.map(k => k.word);
    expect(words).not.toContain('tenho');
    expect(words).not.toContain('para');
    expect(words).not.toContain('voce');
  });

  test('respects maxKeywords limit', () => {
    const text = 'palavra1 palavra2 palavra3 palavra4 palavra5 palavra6';
    const keywords = extractKeywords(text, 3);
    expect(keywords.length).toBeLessThanOrEqual(3);
  });
});

// ── extractTopics ───────────────────────────────────────────

describe('extractTopics', () => {
  test('extracts topics from segments', () => {
    const segments = [
      { text: 'Marketing digital e fundamental para crescer online' },
      { text: 'O marketing digital ajuda empresas a vender mais' },
      { text: 'Estrategia de marketing digital para iniciantes' },
    ];
    const topics = extractTopics(segments);
    expect(topics.length).toBeGreaterThan(0);
  });

  test('handles empty segments', () => {
    const topics = extractTopics([]);
    expect(topics).toHaveLength(0);
  });
});

// ── generateSummary ─────────────────────────────────────────

describe('generateSummary', () => {
  test('generates summary from segments', () => {
    const segments = [
      { text: 'Neste video vamos falar sobre marketing digital' },
      { text: 'O primeiro passo e criar um plano de conteudo' },
      { text: 'Conclusao: marketing digital funciona quando bem feito' },
    ];
    const summary = generateSummary(segments);
    expect(summary).toContain('marketing digital');
    expect(summary.endsWith('.')).toBe(true);
  });

  test('handles single segment', () => {
    const segments = [{ text: 'Um unico segmento de texto' }];
    const summary = generateSummary(segments);
    expect(summary).toContain('unico segmento');
  });

  test('handles empty segments', () => {
    expect(generateSummary([])).toBe('');
  });
});

// ── suggestTitles ───────────────────────────────────────────

describe('suggestTitles', () => {
  test('suggests titles from keywords and topics', () => {
    const keywords = [{ word: 'marketing', count: 5 }, { word: 'digital', count: 3 }];
    const topics = [{ topic: 'marketing digital', frequency: 4 }];
    const titles = suggestTitles(keywords, topics, null);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.some(t => t.toLowerCase().includes('marketing'))).toBe(true);
  });

  test('limits to 5 titles', () => {
    const keywords = [
      { word: 'teste', count: 10 },
      { word: 'outro', count: 5 },
    ];
    const topics = [{ topic: 'teste algo', frequency: 3 }];
    const titles = suggestTitles(keywords, topics, null);
    expect(titles.length).toBeLessThanOrEqual(5);
  });
});

// ── capitalize ──────────────────────────────────────────────

describe('capitalize', () => {
  test('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('a')).toBe('A');
  });
});

// ── generateDescription (integration) ──────────────────────

describe('generateDescription', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Describe', 'upload', '/test.mp4');

    const transcription = {
      segments: [
        { start: 0, end: 5, text: 'Fala galera bem vindos ao video sobre marketing digital', confidence: 0.95 },
        { start: 5.5, end: 12, text: 'Hoje vamos aprender estrategias de marketing digital para crescer', confidence: 0.92 },
        { start: 12.5, end: 20, text: 'O marketing digital e a melhor forma de vender online atualmente', confidence: 0.90 },
        { start: 21, end: 28, text: 'Primeira estrategia e criar conteudo de valor para sua audiencia', confidence: 0.93 },
        { start: 29, end: 35, text: 'Segunda estrategia e investir em trafego pago de forma inteligente', confidence: 0.91 },
      ],
      totalDuration: 35,
      language: 'pt',
      totalWords: 45,
    };

    const analysisDir = path.join(getProjectDir(testProjectId), 'analysis');
    fs.writeFileSync(path.join(analysisDir, 'transcription.json'), JSON.stringify(transcription, null, 2));
  });

  test('generates full description', () => {
    const result = generateDescription(testProjectId);

    expect(result.summary).toBeTruthy();
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.suggestedTitles.length).toBeGreaterThan(0);
    expect(result.wordCount).toBe(45);
    expect(result.language).toBe('pt');

    // Check file saved
    const descFile = path.join(getProjectDir(testProjectId), 'analysis', 'description.json');
    expect(fs.existsSync(descFile)).toBe(true);
  });

  test('throws if no transcription', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    expect(() => generateDescription(emptyId)).toThrow('Transcription not found');
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});
