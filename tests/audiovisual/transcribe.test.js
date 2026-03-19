'use strict';

/**
 * Tests for Central Audiovisual — Transcription Engine
 * Story: AV-2.2
 */

const fs = require('fs');
const path = require('path');
const { parseSRT, parseVTT, generateSRT, parseTimestamp, formatTimestamp } = require('../../packages/audiovisual/lib/srt-parser');
const { createProjectStructure, getProjectDir } = require('../../packages/audiovisual/lib/project');
const { importSRT } = require('../../packages/audiovisual/lib/transcribe');
const { generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── SRT Parser ──────────────────────────────────────────────

describe('SRT Parser', () => {
  const sampleSRT = `1
00:00:00,000 --> 00:00:05,200
Fala galera, bem vindos ao video de hoje.

2
00:00:05,500 --> 00:00:12,800
Hoje eu vou mostrar como funciona o sistema.

3
00:00:13,000 --> 00:00:20,500
Entao vamos la, se inscreve no canal.
`;

  test('parses SRT content', () => {
    const segments = parseSRT(sampleSRT);
    expect(segments).toHaveLength(3);
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBe(5.2);
    expect(segments[0].text).toBe('Fala galera, bem vindos ao video de hoje.');
    expect(segments[0].confidence).toBe(1.0);
  });

  test('parses VTT content', () => {
    const vtt = 'WEBVTT\n\n' + sampleSRT;
    const segments = parseVTT(vtt);
    expect(segments).toHaveLength(3);
  });

  test('generates valid SRT', () => {
    const segments = parseSRT(sampleSRT);
    const output = generateSRT(segments);
    expect(output).toContain('00:00:00,000 --> 00:00:05,200');
    expect(output).toContain('Fala galera');
    // Re-parse should give same results
    const reparsed = parseSRT(output);
    expect(reparsed).toHaveLength(3);
    expect(reparsed[0].text).toBe(segments[0].text);
  });

  test('handles empty content', () => {
    const segments = parseSRT('');
    expect(segments).toHaveLength(0);
  });
});

// ── Timestamp utils ─────────────────────────────────────────

describe('Timestamp utils', () => {
  test('parseTimestamp converts HH:MM:SS,mmm to seconds', () => {
    expect(parseTimestamp('00:00:00,000')).toBe(0);
    expect(parseTimestamp('00:01:30,500')).toBe(90.5);
    expect(parseTimestamp('01:00:00,000')).toBe(3600);
    expect(parseTimestamp('00:00:05,200')).toBe(5.2);
  });

  test('formatTimestamp converts seconds to HH:MM:SS,mmm', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000');
    expect(formatTimestamp(90.5)).toBe('00:01:30,500');
    expect(formatTimestamp(3600)).toBe('01:00:00,000');
  });

  test('roundtrip timestamp conversion', () => {
    const original = '00:05:32,750';
    const seconds = parseTimestamp(original);
    const formatted = formatTimestamp(seconds);
    expect(formatted).toBe(original);
  });
});

// ── Import SRT ──────────────────────────────────────────────

describe('Import SRT', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Transcribe', 'upload', '/test.mp4');
  });

  test('imports SRT file into project', () => {
    // Create temp SRT file
    const srtContent = `1
00:00:00,000 --> 00:00:03,000
Primeiro segmento de teste.

2
00:00:03,500 --> 00:00:07,000
Segundo segmento de teste.

3
00:00:07,500 --> 00:00:12,000
Terceiro segmento de teste.
`;
    const tempSRT = path.join(getProjectDir(testProjectId), 'test.srt');
    fs.writeFileSync(tempSRT, srtContent);

    const result = importSRT(testProjectId, tempSRT);
    expect(result.segments).toHaveLength(3);
    expect(result.totalWords).toBeGreaterThan(0);
    expect(result.source).toContain('import:');

    // Check files were created
    const analysisDir = path.join(getProjectDir(testProjectId), 'analysis');
    expect(fs.existsSync(path.join(analysisDir, 'transcription.json'))).toBe(true);
    expect(fs.existsSync(path.join(analysisDir, 'transcription.srt'))).toBe(true);
  });

  test('throws on missing file', () => {
    expect(() => importSRT(testProjectId, '/nonexistent.srt')).toThrow('File not found');
  });

  afterAll(() => {
    const projectDir = getProjectDir(testProjectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
