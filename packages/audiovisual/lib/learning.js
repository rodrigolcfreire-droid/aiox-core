#!/usr/bin/env node
'use strict';

/**
 * learning.js — Pattern learning engine
 * Story: AV-6.2
 *
 * Learns from user approval decisions to improve
 * future cut suggestions and scoring.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { loadApprovals } = require('./approval');

function loadLearnings(projectId) {
  const learnPath = path.join(getProjectDir(projectId), 'data', 'learnings.json');
  if (!fs.existsSync(learnPath)) {
    return { patterns: [], updatedAt: null };
  }
  return JSON.parse(fs.readFileSync(learnPath, 'utf8'));
}

function saveLearnings(projectId, learnings) {
  const dataDir = path.join(getProjectDir(projectId), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  learnings.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'learnings.json'), JSON.stringify(learnings, null, 2));
}

function analyzeCategoryPreferences(decisions) {
  const categories = {};
  for (const d of decisions) {
    if (!categories[d.category]) {
      categories[d.category] = { approved: 0, rejected: 0, total: 0 };
    }
    categories[d.category].total++;
    if (d.decision === 'approved') categories[d.category].approved++;
    if (d.decision === 'rejected') categories[d.category].rejected++;
  }

  return Object.entries(categories).map(([category, stats]) => ({
    type: 'category_preference',
    category,
    approvalRate: stats.total > 0 ? parseFloat((stats.approved / stats.total).toFixed(2)) : 0,
    ...stats,
  }));
}

function analyzeDurationPreferences(decisions) {
  const approved = decisions.filter(d => d.decision === 'approved' && d.duration);
  const rejected = decisions.filter(d => d.decision === 'rejected' && d.duration);

  if (approved.length === 0) return [];

  const avgApproved = approved.reduce((sum, d) => sum + d.duration, 0) / approved.length;
  const avgRejected = rejected.length > 0
    ? rejected.reduce((sum, d) => sum + d.duration, 0) / rejected.length
    : 0;

  return [{
    type: 'duration_preference',
    avgApprovedDuration: parseFloat(avgApproved.toFixed(1)),
    avgRejectedDuration: parseFloat(avgRejected.toFixed(1)),
    preferredRange: {
      min: parseFloat(Math.max(10, avgApproved * 0.7).toFixed(1)),
      max: parseFloat((avgApproved * 1.3).toFixed(1)),
    },
    sampleSize: approved.length + rejected.length,
  }];
}

function analyzePlatformPreferences(decisions) {
  const platforms = {};
  for (const d of decisions) {
    for (const p of (d.platform || [])) {
      if (!platforms[p]) platforms[p] = { approved: 0, rejected: 0, total: 0 };
      platforms[p].total++;
      if (d.decision === 'approved') platforms[p].approved++;
      if (d.decision === 'rejected') platforms[p].rejected++;
    }
  }

  return Object.entries(platforms).map(([platform, stats]) => ({
    type: 'platform_preference',
    platform,
    approvalRate: stats.total > 0 ? parseFloat((stats.approved / stats.total).toFixed(2)) : 0,
    ...stats,
  }));
}

function analyzeEngagementCorrelation(decisions) {
  const approved = decisions.filter(d => d.decision === 'approved' && d.engagementScore);
  const rejected = decisions.filter(d => d.decision === 'rejected' && d.engagementScore);

  if (approved.length === 0) return [];

  const avgApproved = approved.reduce((sum, d) => sum + d.engagementScore, 0) / approved.length;
  const avgRejected = rejected.length > 0
    ? rejected.reduce((sum, d) => sum + d.engagementScore, 0) / rejected.length
    : 0;

  return [{
    type: 'engagement_correlation',
    avgApprovedScore: parseFloat(avgApproved.toFixed(2)),
    avgRejectedScore: parseFloat(avgRejected.toFixed(2)),
    threshold: parseFloat(((avgApproved + avgRejected) / 2).toFixed(2)),
    sampleSize: approved.length + rejected.length,
  }];
}

function learnFromProject(projectId) {
  const approvals = loadApprovals(projectId);
  const decisions = approvals.decisions;

  if (decisions.length === 0) {
    return { patterns: [], message: 'No decisions to learn from' };
  }

  const patterns = [
    ...analyzeCategoryPreferences(decisions),
    ...analyzeDurationPreferences(decisions),
    ...analyzePlatformPreferences(decisions),
    ...analyzeEngagementCorrelation(decisions),
  ];

  const learnings = { patterns, updatedAt: new Date().toISOString() };
  saveLearnings(projectId, learnings);

  return learnings;
}

function getLearningInsights(projectId) {
  const learnings = loadLearnings(projectId);
  if (learnings.patterns.length === 0) {
    return { insights: [], message: 'No patterns learned yet' };
  }

  const insights = [];

  // Category insights
  const catPatterns = learnings.patterns.filter(p => p.type === 'category_preference');
  const bestCat = catPatterns.sort((a, b) => b.approvalRate - a.approvalRate)[0];
  if (bestCat) {
    insights.push(`Categoria preferida: ${bestCat.category} (${(bestCat.approvalRate * 100).toFixed(0)}% aprovacao)`);
  }

  // Duration insights
  const durPattern = learnings.patterns.find(p => p.type === 'duration_preference');
  if (durPattern) {
    insights.push(`Duracao ideal: ${durPattern.preferredRange.min}s - ${durPattern.preferredRange.max}s`);
  }

  // Engagement insights
  const engPattern = learnings.patterns.find(p => p.type === 'engagement_correlation');
  if (engPattern) {
    insights.push(`Score minimo sugerido: ${engPattern.threshold}`);
  }

  return { insights, patterns: learnings.patterns };
}

/**
 * Calculate adjusted viral score using real performance data.
 * Story AV-12 (Melhoria 7): Combines heuristic score with actual metrics.
 *
 * Formula: adjustedScore = (heuristicScore * 0.3) + (performanceScore * 0.7)
 * performanceScore = normalized(views, likes, shares, comments, saves)
 */
function calculateAdjustedScore(heuristicScore, metrics = {}) {
  const views = metrics.views || 0;
  const likes = metrics.likes || 0;
  const shares = metrics.shares || 0;
  const comments = metrics.comments || 0;
  const saves = metrics.saves || 0;

  if (views === 0) {
    // No real data yet — use heuristic only
    return { adjustedScore: heuristicScore, source: 'heuristic', confidence: 'low' };
  }

  // Engagement rate
  const engagementRate = (likes + comments + shares + saves) / views;
  // Virality rate (shares/views is strongest signal)
  const viralityRate = shares / views;
  // Save rate (intent signal)
  const saveRate = saves / views;

  // Normalize to 0-10 scale
  const engScore = Math.min(10, engagementRate * 100); // 10% engagement = score 10
  const viralScore = Math.min(10, viralityRate * 200); // 5% share rate = score 10
  const saveScore = Math.min(10, saveRate * 200); // 5% save rate = score 10

  const performanceScore = (engScore * 0.4) + (viralScore * 0.35) + (saveScore * 0.25);
  const adjustedScore = parseFloat(((heuristicScore * 0.3) + (performanceScore * 0.7)).toFixed(1));

  return {
    adjustedScore: Math.min(10, Math.max(0, adjustedScore)),
    performanceScore: parseFloat(performanceScore.toFixed(1)),
    engagementRate: parseFloat(engagementRate.toFixed(4)),
    viralityRate: parseFloat(viralityRate.toFixed(4)),
    saveRate: parseFloat(saveRate.toFixed(4)),
    source: 'real_data',
    confidence: views > 1000 ? 'high' : views > 100 ? 'medium' : 'low',
  };
}

module.exports = {
  learnFromProject,
  getLearningInsights,
  loadLearnings,
  analyzeCategoryPreferences,
  analyzeDurationPreferences,
  analyzePlatformPreferences,
  analyzeEngagementCorrelation,
  calculateAdjustedScore,
};
