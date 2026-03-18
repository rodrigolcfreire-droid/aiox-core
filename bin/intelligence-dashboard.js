#!/usr/bin/env node
'use strict';

/**
 * intelligence-dashboard.js — Generates intelligence-report.json for Health Dashboard
 * [Story INTEL-1] Reads analysis files from .aiox/telegram/ and .aiox/whatsapp/
 * and aggregates them into a dashboard-friendly format.
 *
 * Usage:
 *   node bin/intelligence-dashboard.js              Generate intelligence-report.json
 *   node bin/intelligence-dashboard.js --stdout      Print to stdout (no file write)
 */

const fs = require('fs');
const path = require('path');

const TELEGRAM_DIR = path.resolve(__dirname, '..', '.aiox', 'telegram');
const WHATSAPP_DIR = path.resolve(__dirname, '..', '.aiox', 'whatsapp');
const DASHBOARD_DATA = path.resolve(__dirname, '..', '.aiox-core', 'scripts', 'diagnostics', 'health-dashboard', 'public', 'data');

function loadAnalysisFiles(dir, platform) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('-analysis.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const agentId = file.replace('-analysis.json', '');
      results.push({
        id: agentId,
        platform,
        name: data.agent_name || data.group_name || agentId,
        generated_at: data.generated_at,
        total_messages: data.total_messages || 0,
        classification: data.classification || { duvidas: 0, dores: 0, engajamento: 0 },
        top_questions: (data.top_questions || []).slice(0, 8),
        top_pains: (data.top_pains || []).slice(0, 8),
        topics: {
          bigrams: (data.topics?.bigrams || []).slice(0, 10),
          trigrams: (data.topics?.trigrams || []).slice(0, 5),
        },
        influencers: (data.influencers || []).slice(0, 10),
        segments: data.segments || {},
        viral_topics: data.viral_topics || [],
        peak_hours: data.peak_hours || [],
        content_suggestions: data.content_suggestions || [],
        hour_distribution: data.hour_distribution || [],
      });
    } catch (_e) {
      // Skip corrupt files
    }
  }
  return results;
}

function aggregate(agents) {
  const totals = {
    messages: 0,
    duvidas: 0,
    dores: 0,
    engajamento: 0,
  };

  const allQuestions = [];
  const allPains = [];
  const allTopics = new Map();
  const allSuggestions = [];

  for (const a of agents) {
    totals.messages += a.total_messages;
    totals.duvidas += a.classification.duvidas || 0;
    totals.dores += a.classification.dores || 0;
    totals.engajamento += a.classification.engajamento || 0;

    for (const q of a.top_questions) {
      allQuestions.push({ ...q, agent: a.name, platform: a.platform });
    }
    for (const p of a.top_pains) {
      allPains.push({ ...p, agent: a.name, platform: a.platform });
    }
    for (const item of a.topics.bigrams) {
      const topic = Array.isArray(item) ? item[0] : item.topic;
      const count = Array.isArray(item) ? item[1] : item.count;
      allTopics.set(topic, (allTopics.get(topic) || 0) + (count || 0));
    }
    for (const s of a.content_suggestions) {
      allSuggestions.push({ ...s, agent: a.name, platform: a.platform });
    }
  }

  const topTopics = [...allTopics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([topic, count]) => ({ topic, count }));

  return {
    totals,
    top_questions: allQuestions.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10),
    top_pains: allPains.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10),
    top_topics: topTopics,
    suggestions: allSuggestions
      .sort((a, b) => {
        const prio = { critical: 4, high: 3, medium: 2, low: 1 };
        return (prio[b.priority] || 0) - (prio[a.priority] || 0);
      })
      .slice(0, 10),
  };
}

function generate() {
  const telegramAgents = loadAnalysisFiles(TELEGRAM_DIR, 'telegram');
  const whatsappGroups = loadAnalysisFiles(WHATSAPP_DIR, 'whatsapp');
  const allAgents = [...telegramAgents, ...whatsappGroups];

  const report = {
    generated_at: new Date().toISOString(),
    platforms: {
      telegram: { agents: telegramAgents.length, total_messages: telegramAgents.reduce((s, a) => s + a.total_messages, 0) },
      whatsapp: { groups: whatsappGroups.length, total_messages: whatsappGroups.reduce((s, a) => s + a.total_messages, 0) },
    },
    aggregate: aggregate(allAgents),
    agents: allAgents.map(a => ({
      id: a.id,
      name: a.name,
      platform: a.platform,
      generated_at: a.generated_at,
      total_messages: a.total_messages,
      classification: a.classification,
      topics: a.topics.bigrams.slice(0, 5).map(item =>
        Array.isArray(item) ? { topic: item[0], count: item[1] } : item,
      ),
      influencers: a.influencers.slice(0, 5).map(i => ({
        name: i.name, score: i.score, level: i.level,
      })),
      segments: a.segments,
      viral_topics: a.viral_topics,
      peak_hours: a.peak_hours,
      content_suggestions: a.content_suggestions.slice(0, 5),
      hour_distribution: a.hour_distribution,
    })),
  };

  return report;
}

// ── Main ─────────────────────────────────────────────────────────

const report = generate();

if (process.argv.includes('--stdout')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (!fs.existsSync(DASHBOARD_DATA)) {
    fs.mkdirSync(DASHBOARD_DATA, { recursive: true });
  }
  const outPath = path.join(DASHBOARD_DATA, 'intelligence-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Intelligence report generated: ${outPath}`);
  console.log(`  Platforms: Telegram (${report.platforms.telegram.agents} agents), WhatsApp (${report.platforms.whatsapp.groups} groups)`);
  console.log(`  Total messages: ${report.aggregate.totals.messages}`);
  console.log(`  Duvidas: ${report.aggregate.totals.duvidas} | Dores: ${report.aggregate.totals.dores} | Engajamento: ${report.aggregate.totals.engajamento}`);
}
