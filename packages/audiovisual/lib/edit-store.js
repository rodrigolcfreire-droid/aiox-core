#!/usr/bin/env node
'use strict';

/**
 * edit-store.js — Non-destructive edit CRUD store
 * Story: EG-1
 *
 * Persists edits as JSON files in .aiox/audiovisual/edits/{editId}.json.
 * NEVER modifies source video files (non-destructive editing).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AV_DIR } = require(path.resolve(__dirname, 'constants'));

const EDITS_DIR = path.join(AV_DIR, 'edits');

const VALID_STATUSES = ['draft', 'exported'];

const SCHEMA_FIELDS = [
  'editId', 'projectId', 'sourceVideo', 'trim', 'transcript',
  'subtitles', 'presetId', 'status', 'createdAt', 'updatedAt',
];

/**
 * Validate that an object only contains allowed schema fields.
 * Throws if unknown fields are present.
 */
function validateSchema(data) {
  const keys = Object.keys(data);
  const invalid = keys.filter(k => !SCHEMA_FIELDS.includes(k));
  if (invalid.length > 0) {
    throw new Error(`Invalid fields in edit: ${invalid.join(', ')}`);
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw new Error(`Invalid status "${data.status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

/**
 * Ensure the edits directory exists.
 */
function ensureEditsDir() {
  fs.mkdirSync(EDITS_DIR, { recursive: true });
}

/**
 * Get the file path for an edit.
 */
function getEditPath(editId) {
  return path.join(EDITS_DIR, `${editId}.json`);
}

/**
 * Create a new edit.
 *
 * @param {string} sourceVideo - Path to source video or cutId
 * @param {string} projectId - Project UUID or 'standalone'
 * @param {Object} [options] - Optional initial data (transcript, etc.)
 * @returns {Object} The created edit
 */
function createEdit(sourceVideo, projectId, options = {}) {
  if (!sourceVideo) {
    throw new Error('sourceVideo is required');
  }
  if (!projectId) {
    throw new Error('projectId is required');
  }

  ensureEditsDir();

  const now = new Date().toISOString();
  const editId = crypto.randomUUID();

  const edit = {
    editId,
    projectId,
    sourceVideo,
    trim: { in: 0.0, out: null },
    transcript: options.transcript || [],
    subtitles: options.subtitles || [],
    presetId: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(getEditPath(editId), JSON.stringify(edit, null, 2));
  return edit;
}

/**
 * Get an edit by ID.
 *
 * @param {string} editId - The edit UUID
 * @returns {Object} The edit data
 */
function getEdit(editId) {
  const editPath = getEditPath(editId);
  if (!fs.existsSync(editPath)) {
    throw new Error(`Edit not found: ${editId}`);
  }
  return JSON.parse(fs.readFileSync(editPath, 'utf8'));
}

/**
 * List all edits.
 *
 * @returns {Object[]} Array of edit objects sorted by createdAt descending
 */
function listEdits() {
  ensureEditsDir();

  const files = fs.readdirSync(EDITS_DIR).filter(f => f.endsWith('.json'));

  return files
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(EDITS_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Update an edit with partial data.
 *
 * @param {string} editId - The edit UUID
 * @param {Object} partial - Fields to update
 * @returns {Object} The updated edit
 */
function updateEdit(editId, partial) {
  validateSchema(partial);

  const edit = getEdit(editId);

  // Prevent changing editId or createdAt
  const { editId: _eid, createdAt: _ca, ...safePartial } = partial;

  Object.assign(edit, safePartial, { updatedAt: new Date().toISOString() });

  fs.writeFileSync(getEditPath(editId), JSON.stringify(edit, null, 2));
  return edit;
}

/**
 * Delete an edit.
 *
 * @param {string} editId - The edit UUID
 * @returns {boolean} true if deleted
 */
function deleteEdit(editId) {
  const editPath = getEditPath(editId);
  if (!fs.existsSync(editPath)) {
    throw new Error(`Edit not found: ${editId}`);
  }
  fs.unlinkSync(editPath);
  return true;
}

/**
 * Resolve a cutId to its project and cut data.
 * Searches across all projects for the matching cut.
 *
 * @param {string} cutId - The cut ID (e.g., 'cut_001')
 * @returns {{ projectId: string, cut: Object }} The project ID and cut data
 */
function resolveCutId(cutId) {
  const { PROJECTS_DIR } = require(path.resolve(__dirname, 'constants'));

  if (!fs.existsSync(PROJECTS_DIR)) {
    throw new Error(`Cut not found: ${cutId}. No projects directory.`);
  }

  const projectDirs = fs.readdirSync(PROJECTS_DIR);

  for (const dir of projectDirs) {
    const cutsPath = path.join(PROJECTS_DIR, dir, 'cuts', 'suggested-cuts.json');
    if (!fs.existsSync(cutsPath)) continue;

    try {
      const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
      const cut = (cutsData.suggestedCuts || []).find(c => c.id === cutId);
      if (cut) {
        return { projectId: dir, cut };
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Cut not found: ${cutId}`);
}

module.exports = {
  createEdit,
  getEdit,
  listEdits,
  updateEdit,
  deleteEdit,
  resolveCutId,
  EDITS_DIR,
  VALID_STATUSES,
  SCHEMA_FIELDS,
};
