#!/usr/bin/env node
'use strict';

/**
 * performance.js — Post-publication performance analytics
 * Story: AV-8.3
 *
 * Registra metricas de performance pos-publicacao (views, retencao, shares)
 * e correlaciona com formato/categoria para otimizar futuros cortes.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { AV_DIR } = require('./constants');

const METRICS_DIR = path.join(AV_DIR, 'performance');

function getMetricsPath(projectId) {
  return path.join(getProjectDir(projectId), 'data', 'performance.json');
}

function getGlobalMetricsPath() {
  return path.join(METRICS_DIR, 'global-performance.json');
}

function loadProjectMetrics(projectId) {
  const metricsPath = getMetricsPath(projectId);
  if (!fs.existsSync(metricsPath)) {
    return { metrics: [], updatedAt: null };
  }
  return JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
}

function loadGlobalMetrics() {
  const globalPath = getGlobalMetricsPath();
  if (!fs.existsSync(globalPath)) {
    return { entries: [], insights: [], updatedAt: null };
  }
  return JSON.parse(fs.readFileSync(globalPath, 'utf8'));
}

function registerMetrics(projectId, cutId, metrics) {
  const projectDir = getProjectDir(projectId);
  const dataDir = path.join(projectDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Load cut info
  let cutInfo = null;
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  if (fs.existsSync(cutsPath)) {
    const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
    cutInfo = cutsData.suggestedCuts.find(c => c.id === cutId);
  }

  const entry = {
    cutId,
    projectId,
    views: metrics.views || 0,
    likes: metrics.likes || 0,
    shares: metrics.shares || 0,
    comments: metrics.comments || 0,
    saves: metrics.saves || 0,
    retention: metrics.retention || 0, // percentage 0-100
    reach: metrics.reach || 0,
    platform: metrics.platform || 'unknown',
    category: cutInfo ? cutInfo.category : 'unknown',
    duration: cutInfo ? cutInfo.duration : 0,
    format: cutInfo ? cutInfo.format : 'unknown',
    engagementScore: cutInfo ? cutInfo.engagementScore : 0,
    registeredAt: new Date().toISOString(),
  };

  // Save to project
  const projectMetrics = loadProjectMetrics(projectId);
  projectMetrics.metrics.push(entry);
  projectMetrics.updatedAt = new Date().toISOString();
  fs.writeFileSync(getMetricsPath(projectId), JSON.stringify(projectMetrics, null, 2));

  // Save to global
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const global = loadGlobalMetrics();
  global.entries.push(entry);
  global.updatedAt = new Date().toISOString();
  fs.writeFileSync(getGlobalMetricsPath(), JSON.stringify(global, null, 2));

  return entry;
}

function analyzePerformance(projectId) {
  const projectMetrics = loadProjectMetrics(projectId);
  const metrics = projectMetrics.metrics;

  if (metrics.length === 0) {
    return { insights: [], ranking: [], message: 'Nenhuma metrica registrada' };
  }

  // Ranking by engagement rate
  const ranking = metrics
    .map(m => ({
      cutId: m.cutId,
      platform: m.platform,
      category: m.category,
      views: m.views,
      engagementRate: m.views > 0
        ? parseFloat(((m.likes + m.shares + m.comments + m.saves) / m.views * 100).toFixed(2))
        : 0,
      retention: m.retention,
      predictedScore: m.engagementScore,
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate);

  // Insights
  const insights = [];

  // Best category
  const catPerf = {};
  for (const m of metrics) {
    if (!catPerf[m.category]) catPerf[m.category] = { totalViews: 0, totalEngagement: 0, count: 0 };
    catPerf[m.category].totalViews += m.views;
    catPerf[m.category].totalEngagement += (m.likes + m.shares + m.comments);
    catPerf[m.category].count++;
  }

  const bestCat = Object.entries(catPerf)
    .map(([cat, data]) => ({ category: cat, avgViews: Math.round(data.totalViews / data.count), rate: data.totalViews > 0 ? (data.totalEngagement / data.totalViews * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.avgViews - a.avgViews)[0];

  if (bestCat) {
    insights.push(`Melhor categoria: ${bestCat.category} (media ${bestCat.avgViews} views, ${bestCat.rate}% engagement)`);
  }

  // Best duration range
  const durPerf = metrics.filter(m => m.views > 0);
  if (durPerf.length >= 2) {
    const sorted = durPerf.sort((a, b) => b.views - a.views);
    const top = sorted.slice(0, Math.ceil(sorted.length / 2));
    const avgDur = top.reduce((s, m) => s + m.duration, 0) / top.length;
    insights.push(`Duracao ideal baseada em views: ~${avgDur.toFixed(0)}s`);
  }

  // Retention insight
  const withRetention = metrics.filter(m => m.retention > 0);
  if (withRetention.length > 0) {
    const avgRetention = withRetention.reduce((s, m) => s + m.retention, 0) / withRetention.length;
    insights.push(`Retencao media: ${avgRetention.toFixed(1)}%`);
  }

  // Prediction accuracy
  const withBoth = metrics.filter(m => m.engagementScore > 0 && m.views > 0);
  if (withBoth.length >= 3) {
    const highScoreCuts = withBoth.filter(m => m.engagementScore >= 7);
    const lowScoreCuts = withBoth.filter(m => m.engagementScore < 7);
    const avgHighViews = highScoreCuts.length > 0 ? highScoreCuts.reduce((s, m) => s + m.views, 0) / highScoreCuts.length : 0;
    const avgLowViews = lowScoreCuts.length > 0 ? lowScoreCuts.reduce((s, m) => s + m.views, 0) / lowScoreCuts.length : 0;

    if (avgHighViews > avgLowViews) {
      insights.push(`Score de engagement e preditivo: cortes com score alto tem ${((avgHighViews / Math.max(avgLowViews, 1) - 1) * 100).toFixed(0)}% mais views`);
    }
  }

  return { insights, ranking, totalEntries: metrics.length };
}

module.exports = {
  registerMetrics,
  analyzePerformance,
  loadProjectMetrics,
  loadGlobalMetrics,
};
