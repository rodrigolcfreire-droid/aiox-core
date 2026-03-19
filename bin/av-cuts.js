#!/usr/bin/env node
'use strict';

/**
 * av-cuts.js — CLI para cortes inteligentes
 *
 * Comandos:
 *   node bin/av-cuts.js <project-id>     Sugerir cortes inteligentes
 *
 * CLI First: Este script e a fonte da verdade para cortes audiovisuais.
 */

const path = require('path');
const { generateSmartCuts } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'smart-cuts'));

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Smart Cuts');
    console.log('');
    console.log('  Usage: node bin/av-cuts.js <project-id>');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Smart Cuts');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    const result = generateSmartCuts(projectId);

    console.log('  ── Suggested Cuts ───────────────────────────────');
    for (const cut of result.suggestedCuts) {
      const start = formatTime(cut.start);
      const end = formatTime(cut.end);
      const dur = cut.duration.toFixed(0);
      const platforms = cut.platform.join(', ');
      console.log(`  ${cut.id}  [${start}→${end}]  ${dur}s  ${cut.category.padEnd(12)}  score:${cut.engagementScore}  ${cut.format}  ${platforms}`);
    }

    console.log('');
    console.log('  ── Summary ──────────────────────────────────────');
    console.log(`  Total cuts: ${result.totalSuggested}`);
    console.log('  By platform:');
    for (const [platform, count] of Object.entries(result.platformBreakdown)) {
      if (count > 0) console.log(`    ${platform}: ${count}`);
    }
    console.log('  By category:');
    for (const [category, count] of Object.entries(result.categoryBreakdown)) {
      if (count > 0) console.log(`    ${category}: ${count}`);
    }
    console.log('');
    console.log('  SMART CUTS COMPLETE');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
