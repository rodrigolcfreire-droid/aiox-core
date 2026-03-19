#!/usr/bin/env node
'use strict';

/**
 * av-describe.js — CLI para descricao de conteudo
 *
 * Comandos:
 *   node bin/av-describe.js <project-id>     Gerar descricao do conteudo
 *
 * CLI First: Este script e a fonte da verdade para descricao audiovisual.
 */

const path = require('path');
const { generateDescription } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'describe'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Content Description');
    console.log('');
    console.log('  Usage: node bin/av-describe.js <project-id>');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Content Description');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    const result = generateDescription(projectId);

    console.log('  ── Summary ──────────────────────────────────────');
    console.log(`  ${result.summary}`);
    console.log('');

    console.log('  ── Topics ───────────────────────────────────────');
    for (const topic of result.topics) {
      console.log(`  - ${topic.topic} (${topic.frequency}x)`);
    }
    console.log('');

    console.log('  ── Keywords ─────────────────────────────────────');
    console.log(`  ${result.keywords.map(k => k.word).join(', ')}`);
    console.log('');

    console.log('  ── Suggested Titles ─────────────────────────────');
    for (const title of result.suggestedTitles) {
      console.log(`  - ${title}`);
    }
    console.log('');
    console.log('  DESCRIPTION COMPLETE');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
