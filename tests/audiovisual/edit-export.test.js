'use strict';

/**
 * edit-export.test.js — Tests for edit export engine
 * Story: EG-2
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Generate tmpDir at top level — safe for hoisted mocks because
// path/os are CommonJS and available synchronously at parse time.
const tmpDir = path.join(os.tmpdir(), `edit-export-test-${process.pid}`);
const aioxDir = path.join(tmpDir, '.aiox');
const avDir = path.join(aioxDir, 'audiovisual');

// Mock child_process
jest.mock('child_process');

// Use string literals for module paths so jest can hoist properly.
// The constants module is what edit-store and edit-export both require.
jest.mock('../../packages/audiovisual/lib/constants', () => {
  const p = require('path');
  const o = require('os');
  const t = p.join(o.tmpdir(), `edit-export-test-${process.pid}`);
  return {
    AIOX_DIR: p.join(t, '.aiox'),
    AV_DIR: p.join(t, '.aiox', 'audiovisual'),
    PROJECTS_DIR: p.join(t, '.aiox', 'audiovisual', 'projects'),
    SUPPORTED_FORMATS: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],
  };
});

jest.mock('../../packages/audiovisual/lib/subtitles', () => ({
  generateAnimatedASS: jest.fn().mockReturnValue('[Script Info]\nTitle: mock'),
  burnSubtitles: jest.fn(),
  formatASSTime: jest.fn(s => `0:00:${String(Math.floor(s)).padStart(2, '0')}.00`),
}));

const { execSync } = require('child_process');
const editStore = require('../../packages/audiovisual/lib/edit-store');
const { exportEdit } = require('../../packages/audiovisual/lib/edit-export');
const { burnSubtitles } = require('../../packages/audiovisual/lib/subtitles');

const fakeVideoPath = path.join(tmpDir, 'source.mp4');

beforeAll(() => {
  fs.mkdirSync(path.join(avDir, 'edits'), { recursive: true });
  fs.mkdirSync(path.join(avDir, 'exports'), { recursive: true });
  fs.writeFileSync(fakeVideoPath, 'fake-video-data');
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

beforeEach(() => {
  jest.clearAllMocks();

  execSync.mockImplementation((cmd) => {
    if (typeof cmd === 'string' && cmd.includes('ffprobe') && cmd.includes('width,height')) {
      return Buffer.from('1080,1920\n');
    }
    if (typeof cmd === 'string' && cmd.includes('ffprobe') && cmd.includes('duration')) {
      return Buffer.from('60.0\n');
    }
    if (typeof cmd === 'string') {
      const outputMatch = cmd.match(/"([^"]+\.mp4)"$/);
      if (outputMatch) {
        const outPath = outputMatch[1];
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, 'mock-video-output');
      }
    }
    return Buffer.from('');
  });

  burnSubtitles.mockImplementation((input, assPath, output) => {
    fs.writeFileSync(output, 'mock-subtitled-video');
  });
});

describe('edit-export', () => {
  describe('exportEdit', () => {
    it('exports an edit with trim applied', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone', {
        transcript: [
          { t: 0, text: 'hello', edited: false },
          { t: 2, text: 'world', edited: false },
        ],
      });
      editStore.updateEdit(edit.editId, { trim: { in: 5.0, out: 25.0 } });

      const result = exportEdit(edit.editId, { quality: 'high' });

      expect(result.editId).toBe(edit.editId);
      expect(result.outputPath).toContain(edit.editId);
      expect(result.quality).toBe('high');
      expect(result.duration).toBe(20);

      const ffmpegCalls = execSync.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('ffmpeg'));
      expect(ffmpegCalls.length).toBeGreaterThan(0);
      const trimCall = ffmpegCalls.find(c => c[0].includes('-ss'));
      expect(trimCall).toBeDefined();
      expect(trimCall[0]).toContain('-ss 5');
      expect(trimCall[0]).toContain('-t 20');
    });

    it('exports with subtitle burn when preset is set', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone', {
        transcript: [
          { t: 1, text: 'test subtitle', edited: false },
          { t: 3, text: 'more text', edited: false },
        ],
      });
      editStore.updateEdit(edit.editId, {
        presetId: 'hormozi',
        trim: { in: 0, out: 10 },
      });

      const result = exportEdit(edit.editId);

      expect(result.hasSubtitles).toBe(true);
      expect(result.presetId).toBe('hormozi');
      expect(burnSubtitles).toHaveBeenCalled();
    });

    it('updates status to exported', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone');
      editStore.updateEdit(edit.editId, { trim: { in: 0, out: 10 } });

      exportEdit(edit.editId);

      const updated = editStore.getEdit(edit.editId);
      expect(updated.status).toBe('exported');
    });

    it('throws for invalid editId', () => {
      expect(() => exportEdit('nonexistent-id')).toThrow('Edit not found');
    });

    it('low quality sets 480p scale and fast encoding', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone');
      editStore.updateEdit(edit.editId, { trim: { in: 0, out: 10 } });

      exportEdit(edit.editId, { quality: 'low' });

      const ffmpegCalls = execSync.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('ffmpeg'));
      const trimCall = ffmpegCalls.find(c => c[0].includes('-ss'));
      expect(trimCall[0]).toContain('scale=-2:480');
      expect(trimCall[0]).toContain('ultrafast');
      expect(trimCall[0]).toContain('-crf 32');
    });

    it('high quality uses medium preset and crf 18', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone');
      editStore.updateEdit(edit.editId, { trim: { in: 0, out: 10 } });

      exportEdit(edit.editId, { quality: 'high' });

      const ffmpegCalls = execSync.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('ffmpeg'));
      const trimCall = ffmpegCalls.find(c => c[0].includes('-ss'));
      expect(trimCall[0]).toContain('-preset medium');
      expect(trimCall[0]).toContain('-crf 18');
      expect(trimCall[0]).not.toContain('scale=');
    });

    it('throws for invalid quality value', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone');
      expect(() => exportEdit(edit.editId, { quality: 'ultra' })).toThrow('Invalid quality');
    });

    it('calls progress callback at each stage', () => {
      const edit = editStore.createEdit(fakeVideoPath, 'standalone');
      editStore.updateEdit(edit.editId, { trim: { in: 0, out: 10 } });

      const stages = [];
      const onProgress = (stage, percent) => stages.push({ stage, percent });

      exportEdit(edit.editId, { onProgress });

      expect(stages.length).toBeGreaterThan(0);
      expect(stages[0].stage).toBe('loading');
      expect(stages[stages.length - 1].stage).toBe('done');
      expect(stages[stages.length - 1].percent).toBe(100);
    });
  });
});
