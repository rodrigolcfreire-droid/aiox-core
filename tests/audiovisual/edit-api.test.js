'use strict';

/**
 * edit-api.test.js — Tests for Editor Growth API routes (EG-3)
 *
 * Tests the /api/edit/* routes added to api-server.js.
 * Mocks edit-store, subtitle-presets, edit-export, and transcribe
 * to test the API layer in isolation.
 */

const http = require('http');
const path = require('path');

// ── Mocks ────────────────────────────────────────────────

// Variables prefixed with "mock" are allowed inside jest.mock factories
const mockEdits = new Map();
let mockEditCounter = 0;

jest.mock('../../packages/audiovisual/lib/edit-store', () => ({
  createEdit: jest.fn((source, projectId, options = {}) => {
    const editId = `test-edit-${++mockEditCounter}`;
    const edit = {
      editId,
      projectId,
      sourceVideo: source,
      trim: { in: 0.0, out: null },
      transcript: options.transcript || [],
      subtitles: [],
      presetId: null,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockEdits.set(editId, edit);
    return edit;
  }),
  getEdit: jest.fn((editId) => {
    const edit = mockEdits.get(editId);
    if (!edit) throw new Error(`Edit not found: ${editId}`);
    return { ...edit };
  }),
  listEdits: jest.fn(() => [...mockEdits.values()]),
  updateEdit: jest.fn((editId, partial) => {
    const edit = mockEdits.get(editId);
    if (!edit) throw new Error(`Edit not found: ${editId}`);
    Object.assign(edit, partial, { updatedAt: new Date().toISOString() });
    mockEdits.set(editId, edit);
    return { ...edit };
  }),
  deleteEdit: jest.fn((editId) => {
    if (!mockEdits.has(editId)) throw new Error(`Edit not found: ${editId}`);
    mockEdits.delete(editId);
    return true;
  }),
  resolveCutId: jest.fn((cutId) => {
    if (cutId === 'cut_001') return { projectId: 'proj-123', cut: { id: 'cut_001' } };
    throw new Error(`Cut not found: ${cutId}`);
  }),
  EDITS_DIR: '/tmp/test-edits',
  VALID_STATUSES: ['draft', 'exported'],
  SCHEMA_FIELDS: ['editId', 'projectId', 'sourceVideo', 'trim', 'transcript', 'subtitles', 'presetId', 'status', 'createdAt', 'updatedAt'],
}));

// Mock subtitle-presets
jest.mock('../../packages/audiovisual/lib/subtitle-presets', () => ({
  listPresets: jest.fn(() => [
    { id: 'iris-default', name: 'Iris Default', expert: 'iristhaize' },
    { id: 'iris-clean', name: 'Iris Clean', expert: 'iristhaize' },
    { id: 'iris-forte', name: 'Iris Forte', expert: 'iristhaize' },
    { id: 'caio-pop', name: 'Caio Pop', expert: 'caio-roleta' },
    { id: 'caio-bold', name: 'Caio Bold', expert: 'caio-roleta' },
    { id: 'karaoke', name: 'Karaoke', expert: 'shared' },
    { id: 'beasty', name: 'Beasty', expert: 'shared' },
    { id: 'minimal', name: 'Minimal', expert: 'shared' },
    { id: 'hormozi', name: 'Hormozi', expert: 'shared' },
    { id: 'tiktok-native', name: 'TikTok Native', expert: 'shared' },
    { id: 'reels-box', name: 'Reels Box', expert: 'shared' },
    { id: 'shorts-fade', name: 'Shorts Fade', expert: 'shared' },
    { id: 'cinematic', name: 'Cinematic', expert: 'shared' },
    { id: 'outline-bold', name: 'Outline Bold', expert: 'shared' },
    { id: 'neon-glow', name: 'Neon Glow', expert: 'shared' },
  ]),
  listPresetsByExpert: jest.fn((expert) => {
    const all = [
      { id: 'iris-default', name: 'Iris Default', expert: 'iristhaize' },
      { id: 'iris-clean', name: 'Iris Clean', expert: 'iristhaize' },
      { id: 'iris-forte', name: 'Iris Forte', expert: 'iristhaize' },
      { id: 'caio-pop', name: 'Caio Pop', expert: 'caio-roleta' },
      { id: 'caio-bold', name: 'Caio Bold', expert: 'caio-roleta' },
      { id: 'karaoke', name: 'Karaoke', expert: 'shared' },
      { id: 'beasty', name: 'Beasty', expert: 'shared' },
      { id: 'minimal', name: 'Minimal', expert: 'shared' },
      { id: 'hormozi', name: 'Hormozi', expert: 'shared' },
      { id: 'tiktok-native', name: 'TikTok Native', expert: 'shared' },
      { id: 'reels-box', name: 'Reels Box', expert: 'shared' },
      { id: 'shorts-fade', name: 'Shorts Fade', expert: 'shared' },
      { id: 'cinematic', name: 'Cinematic', expert: 'shared' },
      { id: 'outline-bold', name: 'Outline Bold', expert: 'shared' },
      { id: 'neon-glow', name: 'Neon Glow', expert: 'shared' },
    ];
    return all.filter(p => p.expert === expert);
  }),
  getPreset: jest.fn((id) => {
    if (id === 'iris-default') return { id: 'iris-default', name: 'Iris Default', expert: 'iristhaize' };
    if (id === 'invalid-preset') throw new Error('Preset not found: "invalid-preset"');
    return { id, name: id, expert: 'shared' };
  }),
  PRESETS: {},
}));

// Mock edit-export
jest.mock('../../packages/audiovisual/lib/edit-export', () => ({
  exportEdit: jest.fn((editId, options) => {
    if (options.onProgress) {
      options.onProgress('loading', 0);
      options.onProgress('trimming', 20);
      options.onProgress('subtitles', 50);
      options.onProgress('finalizing', 90);
    }
    return { editId, outputPath: `/tmp/exports/${editId}.mp4`, quality: options.quality || 'high' };
  }),
  EXPORTS_DIR: '/tmp/exports',
}));

// Mock transcribe (async, runs in background)
jest.mock('../../packages/audiovisual/lib/transcribe', () => ({
  transcribeWithWhisper: jest.fn(async () => ({
    segments: [
      { start: 0, end: 2, text: 'Hello' },
      { start: 2, end: 4, text: 'World' },
    ],
  })),
  importSRT: jest.fn(),
}));

// Mock security modules
jest.mock('../../packages/audiovisual/lib/security-monitor', () => ({
  logAccess: jest.fn(),
  logRateLimitHit: jest.fn(),
  getSecurityStatus: jest.fn(() => ({})),
}));

jest.mock('../../packages/audiovisual/lib/security-alerts', () => ({
  startSecurityAlerts: jest.fn(),
  sendIntrusionAlert: jest.fn(),
  sendAccessAlert: jest.fn(),
  sendRateLimitAlert: jest.fn(),
}));

jest.mock('../../packages/audiovisual/lib/security-bot', () => ({
  startSecurityBot: jest.fn(),
}));

// Mock fs.existsSync for export download
const realFs = jest.requireActual('fs');
const originalExistsSync = realFs.existsSync;

// ── Helpers ──────────────────────────────────────────────

let server;
let baseUrl;

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: new URL(baseUrl).port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => {
            try { return JSON.parse(data); } catch { return null; }
          },
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Setup / Teardown ─────────────────────────────────────

beforeAll((done) => {
  // Suppress console.log during tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const { createServer } = require('../../packages/audiovisual/lib/api-server');
  // Use port 0 to get a random available port
  server = http.createServer();

  // Re-import handleRequest to use our mocks
  const { handleRequest } = require('../../packages/audiovisual/lib/api-server');
  server = http.createServer(handleRequest);

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    done();
  });
});

afterAll((done) => {
  jest.restoreAllMocks();
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

beforeEach(() => {
  mockEdits.clear();
  mockEditCounter = 0;
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────

describe('Editor Growth API (EG-3)', () => {
  // ── Presets ──────────────────────────────────────
  describe('GET /api/edit/presets', () => {
    it('returns all 15 presets', async () => {
      const res = await request('GET', '/api/edit/presets');
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.presets).toHaveLength(15);
    });
  });

  describe('GET /api/edit/presets/:expert', () => {
    it('filters presets by expert', async () => {
      const res = await request('GET', '/api/edit/presets/iristhaize');
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.presets).toHaveLength(3);
      data.presets.forEach(p => expect(p.expert).toBe('iristhaize'));
    });

    it('returns empty array for unknown expert', async () => {
      const res = await request('GET', '/api/edit/presets/unknown');
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.presets).toHaveLength(0);
    });
  });

  // ── Create ───────────────────────────────────────
  describe('POST /api/edit/create', () => {
    it('creates edit from cutId (cut mode)', async () => {
      const res = await request('POST', '/api/edit/create', { source: 'cut_001' });
      expect(res.status).toBe(201);
      const data = res.json();
      expect(data.editId).toBeTruthy();
      expect(data.mode).toBe('cut');
      expect(data.status).toBe('draft');
    });

    it('returns error for invalid cutId', async () => {
      const res = await request('POST', '/api/edit/create', { source: 'cut_999' });
      expect(res.status).toBe(400);
      const data = res.json();
      expect(data.error).toContain('Cut not found');
    });

    it('returns error when source is missing', async () => {
      const res = await request('POST', '/api/edit/create', {});
      expect(res.status).toBe(400);
      const data = res.json();
      expect(data.error).toContain('source is required');
    });
  });

  // ── List ─────────────────────────────────────────
  describe('GET /api/edit/list', () => {
    it('returns empty array when no edits', async () => {
      const res = await request('GET', '/api/edit/list');
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.edits).toEqual([]);
    });

    it('returns array of edits after create', async () => {
      await request('POST', '/api/edit/create', { source: 'cut_001' });
      const res = await request('GET', '/api/edit/list');
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.edits.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Get ──────────────────────────────────────────
  describe('GET /api/edit/:editId', () => {
    it('returns edit by id', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('GET', `/api/edit/${editId}`);
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.edit.editId).toBe(editId);
    });

    it('returns 404 for non-existent editId', async () => {
      const res = await request('GET', '/api/edit/non-existent-id');
      expect(res.status).toBe(404);
      const data = res.json();
      expect(data.error).toContain('not found');
    });
  });

  // ── Trim ─────────────────────────────────────────
  describe('PUT /api/edit/:editId/trim', () => {
    it('updates trim values', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/trim`, { in: 1.5, out: 10.0 });
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.edit.trim).toEqual({ in: 1.5, out: 10.0 });
    });

    it('returns 400 when in/out missing', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/trim`, { in: 1.5 });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent edit', async () => {
      const res = await request('PUT', '/api/edit/fake-id/trim', { in: 0, out: 5 });
      expect(res.status).toBe(404);
    });
  });

  // ── Transcript ───────────────────────────────────
  describe('PUT /api/edit/:editId/transcript', () => {
    it('edits a transcript segment', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      // Seed transcript data
      const editStore = require('../../packages/audiovisual/lib/edit-store');
      const edit = mockEdits.get(editId);
      edit.transcript = [{ t: 0, text: 'Hello' }, { t: 2, text: 'World' }];
      mockEdits.set(editId, edit);

      const res = await request('PUT', `/api/edit/${editId}/transcript`, { index: 0, text: 'Hi there' });
      expect(res.status).toBe(200);
    });

    it('returns 400 for missing index/text', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/transcript`, { text: 'Hi' });
      expect(res.status).toBe(400);
    });
  });

  // ── Preset ───────────────────────────────────────
  describe('PUT /api/edit/:editId/preset', () => {
    it('applies a valid preset', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/preset`, { presetId: 'iris-default' });
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.edit.presetId).toBe('iris-default');
    });

    it('returns error for invalid preset', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/preset`, { presetId: 'invalid-preset' });
      expect(res.status).toBe(400);
      const data = res.json();
      expect(data.error).toContain('Preset not found');
    });

    it('returns 400 when presetId missing', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('PUT', `/api/edit/${editId}/preset`, {});
      expect(res.status).toBe(400);
    });
  });

  // ── Export SSE ───────────────────────────────────
  describe('POST /api/edit/:editId/export', () => {
    it('returns SSE content-type and streams progress events', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      // Use raw http request to handle SSE
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port: new URL(baseUrl).port,
          path: `/api/edit/${editId}/export`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };

        const req = http.request(opts, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ quality: 'high' }));
        req.end();
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');

      // Parse SSE events
      const events = res.body.split('\n\n')
        .filter(e => e.startsWith('data:'))
        .map(e => JSON.parse(e.replace('data: ', '')));

      expect(events.length).toBeGreaterThanOrEqual(2);
      const lastEvent = events[events.length - 1];
      expect(lastEvent.stage).toBe('done');
      expect(lastEvent.outputPath).toBeTruthy();
    });

    it('returns 404 for non-existent edit', async () => {
      const res = await request('POST', '/api/edit/non-existent/export', { quality: 'high' });
      expect(res.status).toBe(404);
    });
  });

  // ── Export Download ──────────────────────────────
  describe('GET /api/edit/:editId/export/download', () => {
    it('returns 404 when export file does not exist', async () => {
      const res = await request('GET', '/api/edit/fake-id/export/download');
      expect(res.status).toBe(404);
      const data = res.json();
      expect(data.error).toContain('Export not found');
    });
  });

  // ── Delete ───────────────────────────────────────
  describe('DELETE /api/edit/:editId', () => {
    it('deletes an existing edit', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();

      const res = await request('DELETE', `/api/edit/${editId}`);
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.deleted).toBe(true);
      expect(data.editId).toBe(editId);
    });

    it('returns 404 for non-existent edit', async () => {
      const res = await request('DELETE', '/api/edit/fake-id');
      expect(res.status).toBe(404);
    });
  });

  // ── Full CRUD cycle ──────────────────────────────
  describe('Full CRUD cycle', () => {
    it('create -> trim -> preset -> get -> delete', async () => {
      // Create
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      expect(createRes.status).toBe(201);
      const { editId } = createRes.json();

      // Trim
      const trimRes = await request('PUT', `/api/edit/${editId}/trim`, { in: 2.0, out: 15.0 });
      expect(trimRes.status).toBe(200);

      // Preset
      const presetRes = await request('PUT', `/api/edit/${editId}/preset`, { presetId: 'hormozi' });
      expect(presetRes.status).toBe(200);

      // Get
      const getRes = await request('GET', `/api/edit/${editId}`);
      expect(getRes.status).toBe(200);
      const edit = getRes.json().edit;
      expect(edit.trim).toEqual({ in: 2.0, out: 15.0 });
      expect(edit.presetId).toBe('hormozi');

      // Delete
      const delRes = await request('DELETE', `/api/edit/${editId}`);
      expect(delRes.status).toBe(200);

      // Verify deleted
      const getAgain = await request('GET', `/api/edit/${editId}`);
      expect(getAgain.status).toBe(404);
    });
  });

  // ── Error handling ───────────────────────────────
  describe('Error handling', () => {
    it('returns 404 for unknown edit routes', async () => {
      const res = await request('GET', '/api/edit/unknown-id');
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid body on trim', async () => {
      const createRes = await request('POST', '/api/edit/create', { source: 'cut_001' });
      const { editId } = createRes.json();
      const res = await request('PUT', `/api/edit/${editId}/trim`, {});
      expect(res.status).toBe(400);
    });
  });
});
