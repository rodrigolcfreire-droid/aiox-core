#!/usr/bin/env node
'use strict';

/**
 * playbook.js — Playbook system for documenting best practices
 * Story: AV-6.3
 *
 * Compiles learnings into actionable playbooks
 * with templates and recommendations.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { getLearningInsights, loadLearnings } = require('./learning');

function generatePlaybook(projectId) {
  const projectDir = getProjectDir(projectId);
  const insights = getLearningInsights(projectId);
  const learnings = loadLearnings(projectId);

  // Load project info
  const projectPath = path.join(projectDir, 'project.json');
  const project = fs.existsSync(projectPath)
    ? JSON.parse(fs.readFileSync(projectPath, 'utf8'))
    : { name: projectId };

  const playbook = {
    title: `Playbook: ${project.name}`,
    generatedAt: new Date().toISOString(),
    insights: insights.insights,
    recommendations: [],
    templates: [],
  };

  // Generate recommendations from patterns
  if (learnings.patterns.length > 0) {
    const catPatterns = learnings.patterns
      .filter(p => p.type === 'category_preference')
      .sort((a, b) => b.approvalRate - a.approvalRate);

    if (catPatterns.length > 0) {
      playbook.recommendations.push({
        area: 'Categorias',
        action: `Priorizar cortes da categoria "${catPatterns[0].category}" (${(catPatterns[0].approvalRate * 100).toFixed(0)}% aprovacao)`,
        confidence: catPatterns[0].approvalRate,
      });

      const worstCat = catPatterns[catPatterns.length - 1];
      if (worstCat.approvalRate < 0.5) {
        playbook.recommendations.push({
          area: 'Categorias',
          action: `Reduzir cortes da categoria "${worstCat.category}" (${(worstCat.approvalRate * 100).toFixed(0)}% aprovacao)`,
          confidence: 1 - worstCat.approvalRate,
        });
      }
    }

    const durPattern = learnings.patterns.find(p => p.type === 'duration_preference');
    if (durPattern) {
      playbook.recommendations.push({
        area: 'Duracao',
        action: `Manter cortes entre ${durPattern.preferredRange.min}s e ${durPattern.preferredRange.max}s`,
        confidence: 0.8,
      });
    }

    const engPattern = learnings.patterns.find(p => p.type === 'engagement_correlation');
    if (engPattern && engPattern.threshold > 0) {
      playbook.recommendations.push({
        area: 'Engagement',
        action: `Filtrar cortes com score abaixo de ${engPattern.threshold}`,
        confidence: 0.7,
      });
    }
  }

  // Generate cut templates from approved patterns
  const approvalsPath = path.join(projectDir, 'cuts', 'approvals.json');
  if (fs.existsSync(approvalsPath)) {
    const approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
    const approved = approvals.decisions.filter(d => d.decision === 'approved');

    if (approved.length > 0) {
      const templateMap = {};
      for (const d of approved) {
        const key = `${d.category}-${d.format}`;
        if (!templateMap[key]) {
          templateMap[key] = { category: d.category, format: d.format, durations: [], count: 0 };
        }
        templateMap[key].durations.push(d.duration);
        templateMap[key].count++;
      }

      playbook.templates = Object.values(templateMap).map(t => ({
        category: t.category,
        format: t.format,
        avgDuration: parseFloat((t.durations.reduce((s, d) => s + d, 0) / t.durations.length).toFixed(1)),
        usageCount: t.count,
      }));
    }
  }

  // Save playbook
  const dataDir = path.join(projectDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'playbook.json'), JSON.stringify(playbook, null, 2));

  return playbook;
}

function loadPlaybook(projectId) {
  const playbookPath = path.join(getProjectDir(projectId), 'data', 'playbook.json');
  if (!fs.existsSync(playbookPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(playbookPath, 'utf8'));
}

module.exports = {
  generatePlaybook,
  loadPlaybook,
};
