#!/usr/bin/env node
'use strict';

/**
 * output-manager.js — Final output organization and packaging
 * Story: AV-5.3
 *
 * Organizes rendered videos, generates metadata,
 * creates delivery package with download links.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir, loadProject } = require('./project');
const { getQueueStatus } = require('./render-queue');

function listOutputs(projectId) {
  const outputDir = path.join(getProjectDir(projectId), 'output');
  if (!fs.existsSync(outputDir)) return [];

  return fs.readdirSync(outputDir)
    .filter(f => f.startsWith('final-') && f.endsWith('.mp4'))
    .map(f => {
      const filePath = path.join(outputDir, f);
      const stats = fs.statSync(filePath);
      const cutId = f.replace('final-', '').replace('.mp4', '');
      return {
        filename: f,
        cutId,
        path: filePath,
        sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(1)),
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function generatePackage(projectId) {
  const project = loadProject(projectId);
  const outputs = listOutputs(projectId);
  const projectDir = getProjectDir(projectId);
  const outputDir = path.join(projectDir, 'output');

  // Load cut info
  let cutsData = null;
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  if (fs.existsSync(cutsPath)) {
    cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  }

  // Load description
  let description = null;
  const descPath = path.join(projectDir, 'analysis', 'description.json');
  if (fs.existsSync(descPath)) {
    description = JSON.parse(fs.readFileSync(descPath, 'utf8'));
  }

  const packageData = {
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
    },
    outputs: outputs.map(o => {
      const cut = cutsData
        ? cutsData.suggestedCuts.find(c => c.id === o.cutId)
        : null;

      return {
        filename: o.filename,
        cutId: o.cutId,
        sizeMB: o.sizeMB,
        category: cut ? cut.category : 'unknown',
        platform: cut ? cut.platform : [],
        format: cut ? cut.format : 'unknown',
        duration: cut ? cut.duration : 0,
        engagementScore: cut ? cut.engagementScore : 0,
        title: description
          ? (description.suggestedTitles[0] || project.name)
          : project.name,
        tags: description ? description.keywords.map(k => k.word).slice(0, 10) : [],
      };
    }),
    totalOutputs: outputs.length,
    totalSizeMB: parseFloat(outputs.reduce((sum, o) => sum + o.sizeMB, 0).toFixed(1)),
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(outputDir, 'package.json'),
    JSON.stringify(packageData, null, 2),
  );

  return packageData;
}

function generateOutputReport(projectId) {
  const pkg = generatePackage(projectId);
  const queueStatus = getQueueStatus(projectId);

  const report = {
    ...pkg,
    renderStatus: {
      total: queueStatus.total,
      rendered: queueStatus.rendered,
      errors: queueStatus.error,
    },
    generatedAt: new Date().toISOString(),
  };

  const outputDir = path.join(getProjectDir(projectId), 'output');
  fs.writeFileSync(
    path.join(outputDir, 'output-report.json'),
    JSON.stringify(report, null, 2),
  );

  return report;
}

module.exports = {
  listOutputs,
  generatePackage,
  generateOutputReport,
};
