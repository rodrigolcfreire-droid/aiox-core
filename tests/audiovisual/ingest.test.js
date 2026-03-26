'use strict';

/**
 * Tests for Central Audiovisual — Ingest Pipeline
 * Story: AV-2.1
 */

const fs = require('fs');
const path = require('path');
const {
  detectSourceType,
  parseGoogleDriveUrl,
  validateFormat,
} = require('../../packages/audiovisual/lib/ingest');
const {
  generateProjectId,
  createProjectStructure,
  loadProject,
  updateProjectStatus,
  listProjects,
  getProjectDir,
} = require('../../packages/audiovisual/lib/project');
const { checkFFprobe } = require('../../packages/audiovisual/lib/ffprobe');
const { SUPPORTED_FORMATS, PROJECT_STATUS, PROJECT_SUBDIRS } = require('../../packages/audiovisual/lib/constants');

// ── detectSourceType ────────────────────────────────────────

describe('detectSourceType', () => {
  test('detects local file', () => {
    // Use a file that exists
    expect(detectSourceType(__filename)).toBe('upload');
  });

  test('detects Google Drive URL', () => {
    expect(detectSourceType('https://drive.google.com/file/d/abc123/view')).toBe('drive');
  });

  test('detects direct URL', () => {
    expect(detectSourceType('https://example.com/video.mp4')).toBe('url');
  });

  test('throws on invalid source', () => {
    expect(() => detectSourceType('/nonexistent/path/video.mp4')).toThrow('Invalid source');
  });
});

// ── parseGoogleDriveUrl ─────────────────────────────────────

describe('parseGoogleDriveUrl', () => {
  test('parses /file/d/ format', () => {
    const url = 'https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing';
    const result = parseGoogleDriveUrl(url);
    expect(result.fileId).toBe('1a2b3c4d5e');
    expect(result.url).toContain('export=download');
  });

  test('parses ?id= format', () => {
    const url = 'https://drive.google.com/open?id=xyz789';
    const result = parseGoogleDriveUrl(url);
    expect(result.fileId).toBe('xyz789');
  });

  test('throws on invalid Drive URL', () => {
    expect(() => parseGoogleDriveUrl('https://drive.google.com/invalid')).toThrow('Could not extract');
  });
});

// ── validateFormat ──────────────────────────────────────────

describe('validateFormat', () => {
  test('accepts supported formats', () => {
    for (const fmt of SUPPORTED_FORMATS) {
      expect(() => validateFormat(`video${fmt}`)).not.toThrow();
    }
  });

  test('rejects unsupported format', () => {
    expect(() => validateFormat('video.txt')).toThrow('Unsupported format');
  });
});

// ── Project management ──────────────────────────────────────

describe('project management', () => {
  let testProjectId;

  test('generates UUID project ID', () => {
    testProjectId = generateProjectId();
    expect(testProjectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('creates project structure', () => {
    const project = createProjectStructure(testProjectId, 'Test Video', 'upload', '/test.mp4');
    const projectDir = getProjectDir(testProjectId);

    expect(project.id).toBe(testProjectId);
    expect(project.name).toBe('Test Video');
    expect(project.status).toBe(PROJECT_STATUS.CREATED);
    expect(fs.existsSync(projectDir)).toBe(true);

    for (const sub of PROJECT_SUBDIRS) {
      expect(fs.existsSync(path.join(projectDir, sub))).toBe(true);
    }
  });

  test('loads project', () => {
    const project = loadProject(testProjectId);
    expect(project.id).toBe(testProjectId);
    expect(project.name).toBe('Test Video');
  });

  test('updates project status', () => {
    updateProjectStatus(testProjectId, PROJECT_STATUS.INGESTING);
    const project = loadProject(testProjectId);
    expect(project.status).toBe(PROJECT_STATUS.INGESTING);
  });

  test('lists projects', () => {
    const projects = listProjects();
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.find(p => p.id === testProjectId)).toBeTruthy();
  });

  test('throws on missing project', () => {
    expect(() => loadProject('nonexistent-id')).toThrow('Project not found');
  });

  // Cleanup
  afterAll(() => {
    const projectDir = getProjectDir(testProjectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ── FFprobe ─────────────────────────────────────────────────

describe('ffprobe', () => {
  test('checkFFprobe returns boolean', () => {
    const result = checkFFprobe();
    expect(typeof result).toBe('boolean');
  });
});

// ── Constants ───────────────────────────────────────────────

describe('constants', () => {
  test('SUPPORTED_FORMATS includes common formats', () => {
    expect(SUPPORTED_FORMATS).toContain('.mp4');
    expect(SUPPORTED_FORMATS).toContain('.mov');
    expect(SUPPORTED_FORMATS).toContain('.webm');
  });

  test('PROJECT_STATUS has expected states', () => {
    expect(PROJECT_STATUS.CREATED).toBe('created');
    expect(PROJECT_STATUS.ANALYZED).toBe('analyzed');
    expect(PROJECT_STATUS.DONE).toBe('done');
  });
});
