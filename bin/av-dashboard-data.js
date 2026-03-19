#!/usr/bin/env node
'use strict';

/**
 * av-dashboard-data.js — Gera dados JSON para o dashboard da Central Audiovisual
 *
 * Uso: node bin/av-dashboard-data.js
 *
 * Exporta dados de todos os projetos para o dashboard consumir.
 * CLI First: dados gerados pelo CLI, dashboard apenas observa.
 */

const fs = require('fs');
const path = require('path');
const { listProjects, loadProject, getProjectDir } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));
const { PROJECTS_DIR } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'constants'));

const DASHBOARD_DATA_DIR = path.resolve(__dirname, '..', '.aiox-core', 'scripts', 'diagnostics', 'health-dashboard', 'public', 'data');

function gatherProjectData(project) {
  const projectDir = getProjectDir(project.id);
  const data = { ...project, cuts: null, outputs: null, approvals: null, learnings: null, description: null };

  // Cuts
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  if (fs.existsSync(cutsPath)) {
    data.cuts = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  }

  // Outputs
  const outputDir = path.join(projectDir, 'output');
  if (fs.existsSync(outputDir)) {
    const outputFiles = fs.readdirSync(outputDir).filter(f => f.startsWith('final-') && f.endsWith('.mp4'));
    data.outputs = outputFiles.map(f => {
      const stats = fs.statSync(path.join(outputDir, f));
      return { filename: f, sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(1)), createdAt: stats.mtime.toISOString() };
    });
  }

  // Approvals
  const approvalsPath = path.join(projectDir, 'cuts', 'approvals.json');
  if (fs.existsSync(approvalsPath)) {
    data.approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  }

  // Learnings
  const learningsPath = path.join(projectDir, 'data', 'learnings.json');
  if (fs.existsSync(learningsPath)) {
    data.learnings = JSON.parse(fs.readFileSync(learningsPath, 'utf8'));
  }

  // Description
  const descPath = path.join(projectDir, 'analysis', 'description.json');
  if (fs.existsSync(descPath)) {
    data.description = JSON.parse(fs.readFileSync(descPath, 'utf8'));
  }

  // Segments
  const segPath = path.join(projectDir, 'analysis', 'segments.json');
  if (fs.existsSync(segPath)) {
    data.segments = JSON.parse(fs.readFileSync(segPath, 'utf8'));
  }

  // Render queue
  const queuePath = path.join(projectDir, 'output', 'render-queue.json');
  if (fs.existsSync(queuePath)) {
    data.renderQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  }

  return data;
}

function generateDashboardData() {
  const projects = listProjects();

  const totalCuts = projects.reduce((sum, p) => {
    const pd = gatherProjectData(p);
    return sum + (pd.cuts ? pd.cuts.totalSuggested || pd.cuts.suggestedCuts.length : 0);
  }, 0);

  const totalOutputs = projects.reduce((sum, p) => {
    const pd = gatherProjectData(p);
    return sum + (pd.outputs ? pd.outputs.length : 0);
  }, 0);

  const statusCounts = { created: 0, ingesting: 0, analyzing: 0, analyzed: 0, producing: 0, rendered: 0, published: 0, done: 0, error: 0 };
  for (const p of projects) {
    if (statusCounts[p.status] !== undefined) statusCounts[p.status]++;
  }

  const dashboardData = {
    generated_at: new Date().toISOString(),
    summary: {
      totalProjects: projects.length,
      totalCuts,
      totalOutputs,
      statusCounts,
      activeProjects: projects.filter(p => !['done', 'error'].includes(p.status)).length,
    },
    projects: projects.map(p => gatherProjectData(p)),
  };

  fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
  const outputPath = path.join(DASHBOARD_DATA_DIR, 'audiovisual-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));

  console.log('');
  console.log('  Central Audiovisual — Dashboard Data Generated');
  console.log(`  Projects: ${projects.length}`);
  console.log(`  Cuts: ${totalCuts}`);
  console.log(`  Outputs: ${totalOutputs}`);
  console.log(`  File: ${outputPath}`);
  console.log('');

  return dashboardData;
}

generateDashboardData();
