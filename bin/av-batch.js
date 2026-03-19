#!/usr/bin/env node
'use strict';

/**
 * av-batch.js — CLI para ingestao em lote
 *
 * Comandos:
 *   node bin/av-batch.js <pasta-com-videos>     Ingerir todos os videos da pasta
 *   node bin/av-batch.js <video1> <video2> ...  Ingerir videos especificos
 */

const fs = require('fs');
const path = require('path');
const { batchIngest, batchIngestFromDir } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'batch'));

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Batch Ingestion');
    console.log('');
    console.log('  Por pasta:');
    console.log('    node bin/av-batch.js /caminho/pasta-com-videos');
    console.log('');
    console.log('  Arquivos especificos:');
    console.log('    node bin/av-batch.js video1.mp4 video2.mp4 video3.mp4');
    console.log('');
    process.exit(0);
  }

  console.log('');
  console.log('  ================================================================');
  console.log('  BATCH INGESTION — Ingestao em Lote');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    let result;

    // Check if first arg is a directory
    if (args.length === 1 && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) {
      result = await batchIngestFromDir(args[0]);
    } else {
      result = await batchIngest(args);
    }

    console.log('  ================================================================');
    console.log('  BATCH COMPLETE');
    console.log(`  Total: ${result.total} | Sucesso: ${result.success} | Erros: ${result.errors}`);
    if (result.results.length > 0) {
      console.log('\n  Projetos criados:');
      for (const r of result.results) {
        console.log(`    ${r.projectId}  ${path.basename(r.source)}`);
      }
    }
    console.log('  ================================================================');
    console.log('');
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

main();
