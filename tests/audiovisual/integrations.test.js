'use strict';

/**
 * Tests for AV-9: Integrations
 * API Server, Thumbnails, DB Client, Drive, Webhooks
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Thumbnail
const { extractFrame } = require('../../packages/audiovisual/lib/thumbnail');

// DB Client
const { getConfig } = require('../../packages/audiovisual/lib/db-client');

// Webhooks
const { registerHook, removeHook, listHooks, emit, EVENT_TYPES } = require('../../packages/audiovisual/lib/webhooks');
const { AV_DIR } = require('../../packages/audiovisual/lib/constants');

// API Server
const { handleRequest, DEFAULT_PORT } = require('../../packages/audiovisual/lib/api-server');

// Drive
const { loadToken } = require('../../packages/audiovisual/lib/drive-upload');

const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

// ── API Server ──────────────────────────────────────────────

describe('API Server', () => {
  test('DEFAULT_PORT is 3456', () => {
    expect(DEFAULT_PORT).toBe(3456);
  });

  test('handleRequest is a function', () => {
    expect(typeof handleRequest).toBe('function');
  });

  function mockReq(method, url) {
    return {
      method,
      url,
      on: () => {},
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'user-agent': 'jest-test' },
    };
  }

  test('health endpoint works', (done) => {
    const req = mockReq('GET', '/api/health');
    const res = {
      writeHead: jest.fn(),
      end: jest.fn((data) => {
        const parsed = JSON.parse(data);
        expect(parsed.status).toBe('ok');
        expect(parsed.service).toBe('central-audiovisual');
        done();
      }),
    };
    handleRequest(req, res);
  });

  test('404 for unknown routes', (done) => {
    const req = mockReq('GET', '/api/nonexistent');
    const res = {
      writeHead: jest.fn(),
      end: jest.fn((data) => {
        const parsed = JSON.parse(data);
        expect(parsed.error).toContain('Not found');
        expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
        done();
      }),
    };
    handleRequest(req, res);
  });

  test('projects endpoint works', (done) => {
    const req = mockReq('GET', '/api/projects');
    const res = {
      writeHead: jest.fn(),
      end: jest.fn((data) => {
        const parsed = JSON.parse(data);
        expect(parsed).toHaveProperty('projects');
        expect(Array.isArray(parsed.projects)).toBe(true);
        done();
      }),
    };
    handleRequest(req, res);
  });
});

// ── Thumbnails ──────────────────────────────────────────────

describe('Thumbnails', () => {
  test('extractFrame is a function', () => {
    expect(typeof extractFrame).toBe('function');
  });

  test('extractFrame returns false for nonexistent video', () => {
    const result = extractFrame('/nonexistent.mp4', 0, '/tmp/test-thumb.jpg');
    expect(result).toBe(false);
  });
});

// ── DB Client ───────────────────────────────────────────────

describe('DB Client', () => {
  test('getConfig returns url and key', () => {
    const config = getConfig();
    expect(config).toHaveProperty('url');
    expect(config).toHaveProperty('key');
  });
});

// ── Webhooks ────────────────────────────────────────────────

describe('Webhooks', () => {
  const hooksPath = path.join(AV_DIR, 'webhooks.json');

  beforeAll(() => {
    if (fs.existsSync(hooksPath)) fs.unlinkSync(hooksPath);
  });

  afterAll(() => {
    if (fs.existsSync(hooksPath)) fs.unlinkSync(hooksPath);
    // Clean log
    const logPath = path.join(AV_DIR, 'logs', 'events.jsonl');
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  });

  test('EVENT_TYPES has all events', () => {
    expect(EVENT_TYPES.PROJECT_CREATED).toBe('project.created');
    expect(EVENT_TYPES.CUTS_APPROVED).toBe('cuts.approved');
    expect(EVENT_TYPES.VIDEO_PRODUCED).toBe('video.produced');
  });

  test('registers a hook', () => {
    const hook = registerHook('project.created', 'http://localhost:9999/hook');
    expect(hook.id).toBeTruthy();
    expect(hook.event).toBe('project.created');
    expect(hook.active).toBe(true);
  });

  test('lists hooks', () => {
    const hooks = listHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
  });

  test('removes a hook', () => {
    const hooks = listHooks();
    const id = hooks[0].id;
    removeHook(id);
    expect(listHooks().find(h => h.id === id)).toBeUndefined();
  });

  test('emit fires without error', () => {
    registerHook('*', 'http://localhost:9999/catchall');
    // emit should not throw even if target is unreachable
    expect(() => emit('project.created', { projectId: 'test-123' })).not.toThrow();
  });
});

// ── Drive ───────────────────────────────────────────────────

describe('Drive Upload', () => {
  test('loadToken returns null when no token file exists', () => {
    const origExistsSync = fs.existsSync;
    // Mock existsSync to return false for token path
    fs.existsSync = (p) => {
      if (typeof p === 'string' && p.includes('drive-token')) return false;
      return origExistsSync(p);
    };
    try {
      expect(loadToken()).toBeNull();
    } finally {
      fs.existsSync = origExistsSync;
    }
  });
});
