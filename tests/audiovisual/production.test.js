'use strict';

/**
 * Tests for Central Audiovisual — Production Pipeline
 * Stories: AV-4.1, AV-4.2, AV-4.3, AV-4.4
 */

const fs = require('fs');
const path = require('path');

// AV-4.1: Assembly
const { FORMAT_MAP } = require('../../packages/audiovisual/lib/assemble');

// AV-4.2: Subtitles
const { generateASS, formatASSTime, SUBTITLE_STYLES } = require('../../packages/audiovisual/lib/subtitles');

// AV-4.3: Branding
const { loadPreset, DEFAULT_PRESET, LOGO_POSITIONS, savePreset } = require('../../packages/audiovisual/lib/branding');

// AV-4.4: Validation
const { PLATFORM_LIMITS } = require('../../packages/audiovisual/lib/validate');

const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── FORMAT_MAP (Assembly) ───────────────────────────────────

describe('Assembly - FORMAT_MAP', () => {
  test('has all standard formats', () => {
    expect(FORMAT_MAP).toHaveProperty('9:16');
    expect(FORMAT_MAP).toHaveProperty('16:9');
    expect(FORMAT_MAP).toHaveProperty('1:1');
    expect(FORMAT_MAP).toHaveProperty('4:5');
  });

  test('9:16 is vertical (1080x1920)', () => {
    expect(FORMAT_MAP['9:16']).toEqual({ width: 1080, height: 1920 });
  });

  test('16:9 is horizontal (1920x1080)', () => {
    expect(FORMAT_MAP['16:9']).toEqual({ width: 1920, height: 1080 });
  });
});

// ── Subtitles ───────────────────────────────────────────────

describe('Subtitles - generateASS', () => {
  const segments = [
    { start: 0, end: 3, text: 'Primeiro segmento' },
    { start: 3.5, end: 7, text: 'Segundo segmento' },
  ];

  test('generates valid ASS content', () => {
    const ass = generateASS(segments, 'minimal', 1080, 1920);
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('[Events]');
    expect(ass).toContain('Primeiro segmento');
    expect(ass).toContain('Segundo segmento');
    expect(ass).toContain('PlayResX: 1080');
  });

  test('uses correct style', () => {
    const ass = generateASS(segments, 'bold', 1920, 1080);
    expect(ass).toContain('Arial Black');
  });

  test('falls back to minimal for unknown style', () => {
    const ass = generateASS(segments, 'nonexistent', 1080, 1920);
    expect(ass).toContain('Arial');
  });
});

describe('Subtitles - formatASSTime', () => {
  test('formats seconds to ASS time', () => {
    expect(formatASSTime(0)).toBe('0:00:00.00');
    expect(formatASSTime(90.5)).toBe('0:01:30.50');
    expect(formatASSTime(3661.25)).toBe('1:01:01.25');
  });
});

describe('Subtitles - SUBTITLE_STYLES', () => {
  test('has all styles', () => {
    expect(SUBTITLE_STYLES).toHaveProperty('minimal');
    expect(SUBTITLE_STYLES).toHaveProperty('bold');
    expect(SUBTITLE_STYLES).toHaveProperty('karaoke');
    expect(SUBTITLE_STYLES).toHaveProperty('subtitle');
  });

  test('each style has required properties', () => {
    for (const style of Object.values(SUBTITLE_STYLES)) {
      expect(style).toHaveProperty('fontName');
      expect(style).toHaveProperty('fontSize');
      expect(style).toHaveProperty('primaryColor');
      expect(style).toHaveProperty('alignment');
    }
  });
});

// ── Branding ────────────────────────────────────────────────

describe('Branding - DEFAULT_PRESET', () => {
  test('has expected defaults', () => {
    expect(DEFAULT_PRESET.logo).toBeNull();
    expect(DEFAULT_PRESET.logoPosition).toBe('top-right');
    expect(DEFAULT_PRESET.logoScale).toBe(0.1);
    expect(DEFAULT_PRESET.logoOpacity).toBe(0.8);
  });
});

describe('Branding - LOGO_POSITIONS', () => {
  test('has all positions', () => {
    expect(LOGO_POSITIONS).toHaveProperty('top-left');
    expect(LOGO_POSITIONS).toHaveProperty('top-right');
    expect(LOGO_POSITIONS).toHaveProperty('bottom-left');
    expect(LOGO_POSITIONS).toHaveProperty('bottom-right');
  });
});

describe('Branding - loadPreset', () => {
  let testProjectId;

  beforeAll(() => {
    testProjectId = generateProjectId();
    createProjectStructure(testProjectId, 'Test Brand', 'upload', '/test.mp4');
  });

  test('returns default when no preset exists', () => {
    const preset = loadPreset(testProjectId);
    expect(preset.logo).toBeNull();
    expect(preset.logoPosition).toBe('top-right');
  });

  test('saves and loads custom preset', () => {
    savePreset(testProjectId, { logo: '/path/to/logo.png', logoPosition: 'bottom-left' });
    const preset = loadPreset(testProjectId);
    expect(preset.logo).toBe('/path/to/logo.png');
    expect(preset.logoPosition).toBe('bottom-left');
  });

  afterAll(() => {
    fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
  });
});

// ── Validation - PLATFORM_LIMITS ────────────────────────────

describe('Validation - PLATFORM_LIMITS', () => {
  test('has all platforms', () => {
    expect(PLATFORM_LIMITS).toHaveProperty('reels');
    expect(PLATFORM_LIMITS).toHaveProperty('tiktok');
    expect(PLATFORM_LIMITS).toHaveProperty('shorts');
    expect(PLATFORM_LIMITS).toHaveProperty('feed');
    expect(PLATFORM_LIMITS).toHaveProperty('youtube');
  });

  test('Reels max 90s', () => {
    expect(PLATFORM_LIMITS.reels.maxDuration).toBe(90);
  });

  test('TikTok max 180s', () => {
    expect(PLATFORM_LIMITS.tiktok.maxDuration).toBe(180);
  });

  test('Shorts max 60s', () => {
    expect(PLATFORM_LIMITS.shorts.maxDuration).toBe(60);
  });

  test('YouTube allows long videos', () => {
    expect(PLATFORM_LIMITS.youtube.maxDuration).toBeGreaterThan(3600);
  });
});
