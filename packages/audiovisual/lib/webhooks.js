#!/usr/bin/env node
'use strict';

/**
 * webhooks.js — Internal event system for AIOS integration
 * Story: AV-9.5
 *
 * Emits events when audiovisual operations complete,
 * allowing other AIOS sectors to react.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { AV_DIR } = require('./constants');

const HOOKS_PATH = path.join(AV_DIR, 'webhooks.json');

const EVENT_TYPES = {
  PROJECT_CREATED: 'project.created',
  PROJECT_ANALYZED: 'project.analyzed',
  CUTS_GENERATED: 'cuts.generated',
  CUTS_APPROVED: 'cuts.approved',
  VIDEO_PRODUCED: 'video.produced',
  VIDEO_PUBLISHED: 'video.published',
  LEARNING_UPDATED: 'learning.updated',
  BATCH_COMPLETED: 'batch.completed',
};

function loadHooks() {
  if (!fs.existsSync(HOOKS_PATH)) {
    return { hooks: [] };
  }
  return JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
}

function saveHooks(data) {
  fs.mkdirSync(AV_DIR, { recursive: true });
  fs.writeFileSync(HOOKS_PATH, JSON.stringify(data, null, 2));
}

function registerHook(event, url, options = {}) {
  const data = loadHooks();

  const hook = {
    id: `hook_${Date.now().toString(36)}`,
    event,
    url,
    method: options.method || 'POST',
    headers: options.headers || {},
    active: true,
    createdAt: new Date().toISOString(),
  };

  data.hooks.push(hook);
  saveHooks(data);
  return hook;
}

function removeHook(hookId) {
  const data = loadHooks();
  data.hooks = data.hooks.filter(h => h.id !== hookId);
  saveHooks(data);
}

function listHooks() {
  return loadHooks().hooks;
}

function emit(event, payload) {
  const data = loadHooks();
  const hooks = data.hooks.filter(h => h.active && (h.event === event || h.event === '*'));

  const results = [];

  for (const hook of hooks) {
    try {
      const body = JSON.stringify({
        event,
        payload,
        timestamp: new Date().toISOString(),
      });

      const urlObj = new URL(hook.url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const req = protocol.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: hook.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-AIOS-Event': event,
          ...hook.headers,
        },
        timeout: 5000,
      }, (res) => {
        // fire and forget
      });

      req.on('error', () => { /* silent */ });
      req.write(body);
      req.end();

      results.push({ hookId: hook.id, status: 'sent' });
    } catch {
      results.push({ hookId: hook.id, status: 'error' });
    }
  }

  // Log event
  const logDir = path.join(AV_DIR, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logEntry = { event, payload: { projectId: payload.projectId }, hooks: results.length, timestamp: new Date().toISOString() };
  fs.appendFileSync(
    path.join(logDir, 'events.jsonl'),
    JSON.stringify(logEntry) + '\n',
  );

  return results;
}

module.exports = {
  registerHook,
  removeHook,
  listHooks,
  emit,
  EVENT_TYPES,
};
