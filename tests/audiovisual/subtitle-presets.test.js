'use strict';

/**
 * subtitle-presets.test.js — Tests for subtitle preset library
 * Story: EG-2
 */

const path = require('path');

const {
  getPreset,
  listPresets,
  listPresetsByExpert,
  getPresetStyle,
  PRESETS,
} = require(path.resolve(__dirname, '..', '..', 'packages', 'audiovisual', 'lib', 'subtitle-presets'));

describe('subtitle-presets', () => {
  describe('listPresets', () => {
    it('returns all 15 presets', () => {
      const presets = listPresets();
      expect(presets).toHaveLength(15);
    });

    it('each preset has required fields', () => {
      const presets = listPresets();
      for (const p of presets) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('expert');
        expect(p).toHaveProperty('style');
        expect(p).toHaveProperty('animation');
        expect(p).toHaveProperty('highlight');
        expect(p.style).toHaveProperty('font');
        expect(p.style).toHaveProperty('size');
        expect(p.style).toHaveProperty('color');
      }
    });

    it('returns copies (not references to internal data)', () => {
      const presets1 = listPresets();
      const presets2 = listPresets();
      expect(presets1[0]).not.toBe(presets2[0]);
    });
  });

  describe('getPreset', () => {
    it('returns correct preset by id', () => {
      const preset = getPreset('iris-default');
      expect(preset.id).toBe('iris-default');
      expect(preset.name).toBe('Iris Default');
      expect(preset.expert).toBe('iristhaize');
    });

    it('returns hormozi preset', () => {
      const preset = getPreset('hormozi');
      expect(preset.id).toBe('hormozi');
      expect(preset.style.font).toBe('Montserrat Black');
      expect(preset.highlight.color).toBe('#F7C204');
    });

    it('throws descriptive error for invalid preset id', () => {
      expect(() => getPreset('nonexistent')).toThrow('Preset not found: "nonexistent"');
      expect(() => getPreset('nonexistent')).toThrow('Available:');
    });

    it('returns a copy (not reference)', () => {
      const p1 = getPreset('minimal');
      const p2 = getPreset('minimal');
      expect(p1).not.toBe(p2);
      p1.name = 'modified';
      expect(getPreset('minimal').name).toBe('Minimal');
    });
  });

  describe('listPresetsByExpert', () => {
    it('returns 3 presets for iristhaize', () => {
      const presets = listPresetsByExpert('iristhaize');
      expect(presets).toHaveLength(3);
      const ids = presets.map(p => p.id);
      expect(ids).toContain('iris-default');
      expect(ids).toContain('iris-clean');
      expect(ids).toContain('iris-forte');
    });

    it('returns 2 presets for caio-roleta', () => {
      const presets = listPresetsByExpert('caio-roleta');
      expect(presets).toHaveLength(2);
    });

    it('returns 10 presets for shared', () => {
      const presets = listPresetsByExpert('shared');
      expect(presets).toHaveLength(10);
    });

    it('returns empty array for unknown expert', () => {
      const presets = listPresetsByExpert('unknown-expert');
      expect(presets).toHaveLength(0);
    });
  });

  describe('getPresetStyle', () => {
    it('returns FFmpeg-compatible object with required fields', () => {
      const style = getPresetStyle('iris-default');
      expect(style).toHaveProperty('fontName');
      expect(style).toHaveProperty('fontSize');
      expect(style).toHaveProperty('primaryColor');
      expect(style).toHaveProperty('outlineColor');
      expect(style).toHaveProperty('outline');
      expect(style).toHaveProperty('shadow');
      expect(style).toHaveProperty('bold');
      expect(style).toHaveProperty('alignment');
      expect(style).toHaveProperty('marginV');
      expect(style).toHaveProperty('highlight');
      expect(style).toHaveProperty('animation');
    });

    it('converts hex colors to ASS format', () => {
      const style = getPresetStyle('iris-default');
      // #FFFFFF -> &H00FFFFFF
      expect(style.primaryColor).toBe('&H00FFFFFF');
      // #000000 -> &H00000000
      expect(style.outlineColor).toBe('&H00000000');
    });

    it('maps center position to alignment 5', () => {
      const style = getPresetStyle('iris-forte');
      expect(style.alignment).toBe(5);
    });

    it('maps center-bottom position to alignment 2', () => {
      const style = getPresetStyle('iris-default');
      expect(style.alignment).toBe(2);
    });

    it('sets bold=1 for bold fonts', () => {
      const style = getPresetStyle('iris-default'); // Montserrat Bold
      expect(style.bold).toBe(1);
    });

    it('throws for invalid preset id', () => {
      expect(() => getPresetStyle('fake')).toThrow('Preset not found');
    });

    it('includes highlight and animation metadata', () => {
      const style = getPresetStyle('hormozi');
      expect(style.highlight.mode).toBe('word-by-word');
      expect(style.highlight.color).toBe('#F7C204');
      expect(style.animation.type).toBe('pop');
      expect(style.animation.duration).toBe(200);
    });
  });

  describe('PRESETS constant', () => {
    it('has exactly 15 entries', () => {
      expect(Object.keys(PRESETS)).toHaveLength(15);
    });

    it('all ids match their keys', () => {
      for (const [key, value] of Object.entries(PRESETS)) {
        expect(value.id).toBe(key);
      }
    });
  });
});
