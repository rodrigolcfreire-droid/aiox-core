#!/usr/bin/env node
'use strict';

/**
 * project.js — Project management for Central Audiovisual
 * Story: AV-2.1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROJECTS_DIR, PROJECT_SUBDIRS, PROJECT_STATUS, PROJECT_MAX_AGE_DAYS } = require('./constants');

function generateProjectId() {
  return crypto.randomUUID();
}

function getProjectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

function createProjectStructure(projectId, name, sourceType, sourceUrl) {
  const projectDir = getProjectDir(projectId);

  // Create main dir and subdirs
  fs.mkdirSync(projectDir, { recursive: true });
  for (const sub of PROJECT_SUBDIRS) {
    fs.mkdirSync(path.join(projectDir, sub), { recursive: true });
  }

  const projectData = {
    id: projectId,
    name,
    sourceType,
    sourceUrl: sourceUrl || null,
    status: PROJECT_STATUS.CREATED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const projectFile = path.join(projectDir, 'project.json');
  fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2));

  return projectData;
}

function loadProject(projectId) {
  const projectFile = path.join(getProjectDir(projectId), 'project.json');
  if (!fs.existsSync(projectFile)) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return JSON.parse(fs.readFileSync(projectFile, 'utf8'));
}

function updateProjectStatus(projectId, status) {
  const projectFile = path.join(getProjectDir(projectId), 'project.json');
  const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  data.status = status;
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(projectFile, JSON.stringify(data, null, 2));
  return data;
}

function updateProject(projectId, updates) {
  const projectFile = path.join(getProjectDir(projectId), 'project.json');
  const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  Object.assign(data, updates, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(projectFile, JSON.stringify(data, null, 2));
  return data;
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR)
    .filter(dir => {
      const projectFile = path.join(PROJECTS_DIR, dir, 'project.json');
      return fs.existsSync(projectFile);
    })
    .map(dir => {
      const projectFile = path.join(PROJECTS_DIR, dir, 'project.json');
      return JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Remove projects older than PROJECT_MAX_AGE_DAYS.
 * Reads createdAt from project.json; falls back to directory mtime.
 */
function cleanupOldProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return { removed: [], kept: 0 };

  const cutoff = Date.now() - PROJECT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const dirs = fs.readdirSync(PROJECTS_DIR);
  const removed = [];

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    let projectDate;
    const projectFile = path.join(dirPath, 'project.json');
    if (fs.existsSync(projectFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        projectDate = new Date(data.createdAt).getTime();
      } catch { /* fall through to mtime */ }
    }
    if (!projectDate) {
      projectDate = fs.statSync(dirPath).mtimeMs;
    }

    if (projectDate < cutoff) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed.push(dir);
    }
  }

  return { removed, kept: dirs.length - removed.length };
}

module.exports = {
  generateProjectId,
  getProjectDir,
  createProjectStructure,
  loadProject,
  updateProjectStatus,
  updateProject,
  listProjects,
  cleanupOldProjects,
};
