#!/usr/bin/env node
'use strict';

/**
 * av-performance.js — CLI para metricas de performance
 *
 * Comandos:
 *   node bin/av-performance.js <project-id> add <cut-id> --views 1000 --likes 50 --shares 10 --retention 65 --platform reels
 *   node bin/av-performance.js <project-id> analyze     Analisar performance
 *   node bin/av-performance.js <project-id> ranking      Ranking de cortes
 */

const path = require('path');
const { registerMetrics, analyzePerformance } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'performance'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Performance Analytics');
    console.log('');
    console.log('  Registrar metricas:');
    console.log('    node bin/av-performance.js <project-id> add <cut-id> --views 1000 --likes 50 --shares 10');
    console.log('');
    console.log('  Analisar:');
    console.log('    node bin/av-performance.js <project-id> analyze');
    console.log('    node bin/av-performance.js <project-id> ranking');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];
  const command = args[1];

  console.log('');
  console.log('  ================================================================');
  console.log('  ANALISTA DE PERFORMANCE');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');

  try {
    if (command === 'add') {
      const cutId = args[2];
      if (!cutId) { console.error('  Cut ID necessario'); process.exit(1); }
      const metrics = parseMetricFlags(args.slice(3));
      const entry = registerMetrics(projectId, cutId, metrics);
      console.log(`\n  Metricas registradas: ${cutId}`);
      console.log(`  Views: ${entry.views} | Likes: ${entry.likes} | Shares: ${entry.shares} | Retention: ${entry.retention}%\n`);

    } else if (command === 'analyze') {
      const result = analyzePerformance(projectId);
      if (result.insights.length === 0) {
        console.log('\n  Nenhuma metrica registrada ainda.\n');
        process.exit(0);
      }
      console.log('\n  ── Insights ─────────────────────────────────────');
      for (const i of result.insights) console.log(`  - ${i}`);
      console.log(`\n  Entradas: ${result.totalEntries}\n`);

    } else if (command === 'ranking') {
      const result = analyzePerformance(projectId);
      if (!result.ranking || result.ranking.length === 0) {
        console.log('\n  Nenhuma metrica registrada ainda.\n');
        process.exit(0);
      }
      console.log('\n  ── Ranking ──────────────────────────────────────');
      for (const r of result.ranking) {
        console.log(`  ${r.cutId}  ${r.platform.padEnd(10)}  ${r.category.padEnd(12)}  views:${r.views}  eng:${r.engagementRate}%  ret:${r.retention}%`);
      }
      console.log('');

    } else {
      console.error(`  Comando desconhecido: ${command}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

function parseMetricFlags(args) {
  const metrics = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--views') metrics.views = parseInt(args[++i]);
    if (args[i] === '--likes') metrics.likes = parseInt(args[++i]);
    if (args[i] === '--shares') metrics.shares = parseInt(args[++i]);
    if (args[i] === '--comments') metrics.comments = parseInt(args[++i]);
    if (args[i] === '--saves') metrics.saves = parseInt(args[++i]);
    if (args[i] === '--retention') metrics.retention = parseFloat(args[++i]);
    if (args[i] === '--reach') metrics.reach = parseInt(args[++i]);
    if (args[i] === '--platform') metrics.platform = args[++i];
  }
  return metrics;
}

main();
