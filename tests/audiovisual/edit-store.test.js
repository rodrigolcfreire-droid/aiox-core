#!/usr/bin/env node
'use strict';

/**
 * edit-store.test.js — Tests for non-destructive edit store
 * Story: EG-1
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
let editsDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-store-test-'));
  editsDir = path.join(tmpDir, 'edits');
  fs.mkdirSync(editsDir, { recursive: true });
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/**
 * Helper: load edit-store with mocked constants pointing to tmpDir.
 * Uses jest.doMock (not hoisted) so we can reference tmpDir.
 */
function loadEditStore() {
  const constantsPath = path.resolve(
    __dirname, '..', '..', 'packages', 'audiovisual', 'lib', 'constants',
  );

  jest.doMock(constantsPath, () => ({
    AV_DIR: tmpDir,
    PROJECTS_DIR: path.join(tmpDir, 'projects'),
    SUPPORTED_FORMATS: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],
  }));

  const editStorePath = path.resolve(
    __dirname, '..', '..', 'packages', 'audiovisual', 'lib', 'edit-store',
  );

  return require(editStorePath);
}

describe('edit-store', () => {
  describe('createEdit', () => {
    it('should create a standalone edit', () => {
      const store = loadEditStore();

      const edit = store.createEdit('/path/to/video.mp4', 'standalone');

      expect(edit.editId).toBeDefined();
      expect(edit.projectId).toBe('standalone');
      expect(edit.sourceVideo).toBe('/path/to/video.mp4');
      expect(edit.status).toBe('draft');
      expect(edit.trim).toEqual({ in: 0.0, out: null });
      expect(edit.transcript).toEqual([]);
      expect(edit.subtitles).toEqual([]);
      expect(edit.presetId).toBeNull();
      expect(edit.createdAt).toBeDefined();
      expect(edit.updatedAt).toBeDefined();

      // Verify file was persisted
      const filePath = path.join(editsDir, `${edit.editId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should create an edit with transcript from options', () => {
      const store = loadEditStore();
      const transcript = [
        { t: 0.0, text: 'Hello world', edited: false },
        { t: 1.5, text: 'Testing', edited: false },
      ];

      const edit = store.createEdit('/video.mp4', 'standalone', { transcript });

      expect(edit.transcript).toEqual(transcript);
      expect(edit.transcript).toHaveLength(2);
    });

    it('should create an edit from cutId with a project', () => {
      const store = loadEditStore();

      const edit = store.createEdit('cut_001', 'project-uuid-123');

      expect(edit.editId).toBeDefined();
      expect(edit.projectId).toBe('project-uuid-123');
      expect(edit.sourceVideo).toBe('cut_001');
      expect(edit.status).toBe('draft');
    });

    it('should throw if sourceVideo is missing', () => {
      const store = loadEditStore();

      expect(() => store.createEdit(null, 'standalone')).toThrow('sourceVideo is required');
    });

    it('should throw if projectId is missing', () => {
      const store = loadEditStore();

      expect(() => store.createEdit('/video.mp4', null)).toThrow('projectId is required');
    });
  });

  describe('getEdit', () => {
    it('should retrieve an existing edit', () => {
      const store = loadEditStore();
      const created = store.createEdit('/video.mp4', 'standalone');

      const retrieved = store.getEdit(created.editId);

      expect(retrieved.editId).toBe(created.editId);
      expect(retrieved.sourceVideo).toBe('/video.mp4');
    });

    it('should throw for non-existent edit', () => {
      const store = loadEditStore();

      expect(() => store.getEdit('non-existent-id')).toThrow('Edit not found: non-existent-id');
    });
  });

  describe('listEdits', () => {
    it('should return empty array when no edits exist', () => {
      const store = loadEditStore();

      const edits = store.listEdits();

      expect(edits).toEqual([]);
    });

    it('should list all edits sorted by createdAt descending', () => {
      jest.useFakeTimers();
      const store = loadEditStore();

      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const edit1 = store.createEdit('/video1.mp4', 'standalone');

      jest.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));
      const edit2 = store.createEdit('/video2.mp4', 'standalone');

      const edits = store.listEdits();

      expect(edits).toHaveLength(2);
      // Most recent first
      expect(edits[0].editId).toBe(edit2.editId);
      expect(edits[1].editId).toBe(edit1.editId);

      jest.useRealTimers();
    });
  });

  describe('updateEdit (trim)', () => {
    it('should update only trim and preserve all other fields', () => {
      jest.useFakeTimers();
      const store = loadEditStore();
      const transcript = [{ t: 0.0, text: 'Hello', edited: false }];

      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const original = store.createEdit('/video.mp4', 'standalone', { transcript });

      jest.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));
      const updated = store.updateEdit(original.editId, {
        trim: { in: 5.0, out: 30.0 },
      });

      expect(updated.trim).toEqual({ in: 5.0, out: 30.0 });
      expect(updated.sourceVideo).toBe('/video.mp4');
      expect(updated.projectId).toBe('standalone');
      expect(updated.transcript).toEqual(transcript);
      expect(updated.status).toBe('draft');
      expect(updated.editId).toBe(original.editId);
      expect(updated.createdAt).toBe(original.createdAt);
      expect(updated.updatedAt).not.toBe(original.updatedAt);

      jest.useRealTimers();
    });
  });

  describe('updateEdit (transcript-edit)', () => {
    it('should correct text, mark edited, and preserve t', () => {
      const store = loadEditStore();
      const transcript = [
        { t: 0.0, text: 'Helo world', edited: false },
        { t: 1.5, text: 'Second line', edited: false },
      ];
      const original = store.createEdit('/video.mp4', 'standalone', { transcript });

      const newTranscript = [...original.transcript];
      newTranscript[0] = {
        ...newTranscript[0],
        text: 'Hello world',
        edited: true,
      };

      const updated = store.updateEdit(original.editId, { transcript: newTranscript });

      expect(updated.transcript[0].text).toBe('Hello world');
      expect(updated.transcript[0].edited).toBe(true);
      expect(updated.transcript[0].t).toBe(0.0);
      expect(updated.transcript[1].text).toBe('Second line');
      expect(updated.transcript[1].edited).toBe(false);
    });
  });

  describe('updateEdit (status)', () => {
    it('should accept valid status values', () => {
      const store = loadEditStore();
      const edit = store.createEdit('/video.mp4', 'standalone');

      const updated = store.updateEdit(edit.editId, { status: 'exported' });
      expect(updated.status).toBe('exported');
    });

    it('should reject invalid status values', () => {
      const store = loadEditStore();
      const edit = store.createEdit('/video.mp4', 'standalone');

      expect(() => store.updateEdit(edit.editId, { status: 'published' }))
        .toThrow('Invalid status "published"');
    });
  });

  describe('updateEdit (schema validation)', () => {
    it('should reject unknown fields', () => {
      const store = loadEditStore();
      const edit = store.createEdit('/video.mp4', 'standalone');

      expect(() => store.updateEdit(edit.editId, { unknownField: 'value' }))
        .toThrow('Invalid fields in edit: unknownField');
    });
  });

  describe('deleteEdit', () => {
    it('should delete an existing edit', () => {
      const store = loadEditStore();
      const edit = store.createEdit('/video.mp4', 'standalone');

      const result = store.deleteEdit(edit.editId);

      expect(result).toBe(true);
      expect(() => store.getEdit(edit.editId)).toThrow('Edit not found');
    });

    it('should throw when deleting non-existent edit', () => {
      const store = loadEditStore();

      expect(() => store.deleteEdit('non-existent')).toThrow('Edit not found: non-existent');
    });
  });

  describe('resolveCutId', () => {
    it('should resolve a cutId from project cuts', () => {
      const store = loadEditStore();

      const projectId = 'test-project-123';
      const projectDir = path.join(tmpDir, 'projects', projectId, 'cuts');
      fs.mkdirSync(projectDir, { recursive: true });

      const cutsData = {
        suggestedCuts: [
          { id: 'cut_001', start: 10.0, end: 40.0, category: 'viral' },
          { id: 'cut_002', start: 50.0, end: 80.0, category: 'educativo' },
        ],
      };
      fs.writeFileSync(
        path.join(projectDir, 'suggested-cuts.json'),
        JSON.stringify(cutsData, null, 2),
      );

      const result = store.resolveCutId('cut_001');

      expect(result.projectId).toBe(projectId);
      expect(result.cut.id).toBe('cut_001');
      expect(result.cut.start).toBe(10.0);
    });

    it('should throw for non-existent cutId', () => {
      const store = loadEditStore();

      fs.mkdirSync(path.join(tmpDir, 'projects'), { recursive: true });

      expect(() => store.resolveCutId('cut_999')).toThrow('Cut not found: cut_999');
    });
  });

  describe('non-destructiveness', () => {
    it('should never modify the source video file', () => {
      const store = loadEditStore();

      const videoPath = path.join(tmpDir, 'source-video.mp4');
      const originalContent = Buffer.from('fake video content bytes 12345');
      fs.writeFileSync(videoPath, originalContent);
      const originalSize = fs.statSync(videoPath).size;
      const originalBytes = fs.readFileSync(videoPath);

      const edit = store.createEdit(videoPath, 'standalone', {
        transcript: [{ t: 0.0, text: 'Original', edited: false }],
      });

      store.updateEdit(edit.editId, { trim: { in: 5.0, out: 20.0 } });

      const transcript = [...store.getEdit(edit.editId).transcript];
      transcript[0] = { ...transcript[0], text: 'Modified text', edited: true };
      store.updateEdit(edit.editId, { transcript });

      store.updateEdit(edit.editId, { status: 'exported' });

      store.deleteEdit(edit.editId);

      const afterSize = fs.statSync(videoPath).size;
      const afterBytes = fs.readFileSync(videoPath);

      expect(afterSize).toBe(originalSize);
      expect(afterBytes.equals(originalBytes)).toBe(true);
    });
  });
});
