#!/usr/bin/env node
'use strict';

/**
 * project.js — Project management for Central Audiovisual
 * Story: AV-2.1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROJECTS_DIR, PROJECT_SUBDIRS, PROJECT_STATUS } = require('./constants');

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

module.exports = {
  generateProjectId,
  getProjectDir,
  createProjectStructure,
  loadProject,
  updateProjectStatus,
  updateProject,
  listProjects,
};
