#!/usr/bin/env node
'use strict';

/**
 * av-scale.js — CLI para geracao de variacoes em escala
 *
 * Comandos:
 *   node bin/av-scale.js <project-id>                  Gerar variacoes
 *   node bin/av-scale.js <project-id> --max 10         Limitar variacoes
 *
 * CLI First: Este script e a fonte da verdade para escala audiovisual.
 */

const path = require('path');
const { generateVariations } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'scale'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Scale Variations');
    console.log('');
    console.log('  Usage: node bin/av-scale.js <project-id> [--max N]');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];
  const maxIdx = args.indexOf('--max');
  const maxVariations = maxIdx !== -1 ? parseInt(args[maxIdx + 1]) : 20;

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Scale Variations');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    const result = generateVariations(projectId, { maxVariations });

    console.log('  ── Variations ───────────────────────────────────');
    for (const v of result.variations) {
      console.log(`  ${v.id}  ${v.type.padEnd(18)}  ${v.duration.toFixed(0)}s  ${v.description}`);
    }

    console.log('');
    console.log('  ── Summary ──────────────────────────────────────');
    console.log(`  Total: ${result.totalVariations}`);
    for (const [type, count] of Object.entries(result.byType)) {
      if (count > 0) console.log(`    ${type}: ${count}`);
    }
    console.log('');
    console.log('  SCALE COMPLETE');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
