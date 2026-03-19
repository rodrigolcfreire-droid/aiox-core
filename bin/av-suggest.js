#!/usr/bin/env node
'use strict';

/**
 * av-suggest.js — CLI para sugestoes de melhoria
 *
 * Comandos:
 *   node bin/av-suggest.js <project-id>     Gerar sugestoes de melhoria
 */

const path = require('path');
const { generateSuggestions } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'suggestions'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Sugestor de Melhorias');
    console.log('');
    console.log('  Usage: node bin/av-suggest.js <project-id>');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];

  console.log('');
  console.log('  ================================================================');
  console.log('  SUGESTOR DE MELHORIAS');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');

  try {
    const result = generateSuggestions(projectId);

    if (result.totalSuggestions === 0) {
      console.log('\n  Nenhuma sugestao. Tudo parece otimo!\n');
      process.exit(0);
    }

    console.log('');
    for (const s of result.suggestions) {
      const icon = s.priority === 'high' ? '!!' : s.priority === 'medium' ? '! ' : '  ';
      const color = s.priority === 'high' ? 'ALTA' : s.priority === 'medium' ? 'MEDIA' : 'BAIXA';
      console.log(`  [${icon}] ${color} — ${s.type}`);
      console.log(`      ${s.message}`);
      console.log(`      Acao: ${s.action}`);
      if (s.affectedCuts) console.log(`      Cortes: ${s.affectedCuts.join(', ')}`);
      console.log('');
    }

    console.log(`  Total: ${result.totalSuggestions} sugestao(es)`);
    console.log(`  Alta: ${result.byPriority.high} | Media: ${result.byPriority.medium} | Baixa: ${result.byPriority.low}`);
    console.log('');
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

main();
