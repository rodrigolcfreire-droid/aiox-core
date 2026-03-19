#!/usr/bin/env node
'use strict';

/**
 * approval.js — Cut approval workflow
 * Story: AV-6.1
 *
 * CLI-based approval: list cuts, approve/reject/edit,
 * track decisions for learning engine.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');

function loadCutsData(projectId) {
  const cutsPath = path.join(getProjectDir(projectId), 'cuts', 'suggested-cuts.json');
  if (!fs.existsSync(cutsPath)) {
    throw new Error(`No cuts found for project ${projectId}`);
  }
  return JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
}

function saveCutsData(projectId, cutsData) {
  const cutsPath = path.join(getProjectDir(projectId), 'cuts', 'suggested-cuts.json');
  fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));
}

function loadApprovals(projectId) {
  const approvalsPath = path.join(getProjectDir(projectId), 'cuts', 'approvals.json');
  if (!fs.existsSync(approvalsPath)) {
    return { decisions: [], createdAt: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
}

function saveApprovals(projectId, approvals) {
  const cutsDir = path.join(getProjectDir(projectId), 'cuts');
  fs.mkdirSync(cutsDir, { recursive: true });
  fs.writeFileSync(path.join(cutsDir, 'approvals.json'), JSON.stringify(approvals, null, 2));
}

function approveCut(projectId, cutId, feedback = '') {
  return decideCut(projectId, cutId, 'approved', feedback);
}

function rejectCut(projectId, cutId, feedback = '') {
  return decideCut(projectId, cutId, 'rejected', feedback);
}

function decideCut(projectId, cutId, decision, feedback = '') {
  const cutsData = loadCutsData(projectId);
  const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
  if (!cut) {
    throw new Error(`Cut ${cutId} not found`);
  }

  // Update cut status
  cut.status = decision;

  // Record decision
  const approvals = loadApprovals(projectId);
  approvals.decisions.push({
    cutId,
    decision,
    feedback,
    category: cut.category,
    engagementScore: cut.engagementScore,
    duration: cut.duration,
    format: cut.format,
    platform: cut.platform,
    decidedBy: 'human',
    decidedAt: new Date().toISOString(),
  });

  saveCutsData(projectId, cutsData);
  saveApprovals(projectId, approvals);

  return { cutId, decision, feedback };
}

function approveAll(projectId) {
  const cutsData = loadCutsData(projectId);
  const results = [];
  for (const cut of cutsData.suggestedCuts) {
    if (cut.status === 'suggested') {
      const result = approveCut(projectId, cut.id);
      results.push(result);
    }
  }
  return results;
}

function getApprovalSummary(projectId) {
  const cutsData = loadCutsData(projectId);
  const cuts = cutsData.suggestedCuts;

  return {
    total: cuts.length,
    approved: cuts.filter(c => c.status === 'approved').length,
    rejected: cuts.filter(c => c.status === 'rejected').length,
    pending: cuts.filter(c => c.status === 'suggested').length,
    edited: cuts.filter(c => c.status === 'edited').length,
    cuts: cuts.map(c => ({
      id: c.id,
      status: c.status,
      category: c.category,
      duration: c.duration,
      engagementScore: c.engagementScore,
    })),
  };
}

module.exports = {
  approveCut,
  rejectCut,
  decideCut,
  approveAll,
  getApprovalSummary,
  loadApprovals,
  loadCutsData,
};
