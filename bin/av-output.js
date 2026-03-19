#!/usr/bin/env node
'use strict';

/**
 * av-output.js — CLI para gestao de outputs finais
 *
 * Comandos:
 *   node bin/av-output.js <project-id>           Listar outputs
 *   node bin/av-output.js <project-id> package    Gerar pacote de entrega
 *   node bin/av-output.js <project-id> report     Gerar relatorio completo
 *
 * CLI First: Este script e a fonte da verdade para outputs audiovisuais.
 */

const path = require('path');
const { listOutputs, generatePackage, generateOutputReport } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'output-manager'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Output Manager');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-output.js <project-id>');
    console.log('    node bin/av-output.js <project-id> package');
    console.log('    node bin/av-output.js <project-id> report');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];
  const command = args[1] || 'list';

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Output Manager');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    if (command === 'report') {
      const report = generateOutputReport(projectId);
      console.log(`  Project: ${report.project.name}`);
      console.log(`  Outputs: ${report.totalOutputs}`);
      console.log(`  Total size: ${report.totalSizeMB} MB`);
      console.log(`  Rendered: ${report.renderStatus.rendered}/${report.renderStatus.total}`);
      if (report.renderStatus.errors > 0) {
        console.log(`  Errors: ${report.renderStatus.errors}`);
      }
      console.log('');
      console.log('  Report saved to output/output-report.json');
    } else if (command === 'package') {
      const pkg = generatePackage(projectId);
      console.log(`  Project: ${pkg.project.name}`);
      console.log(`  Outputs: ${pkg.totalOutputs}`);
      console.log(`  Total size: ${pkg.totalSizeMB} MB`);
      console.log('');
      for (const o of pkg.outputs) {
        console.log(`  ${o.filename}  ${o.sizeMB}MB  ${o.category}  ${o.platform.join(',')}`);
      }
      console.log('');
      console.log('  Package saved to output/package.json');
    } else {
      const outputs = listOutputs(projectId);
      if (outputs.length === 0) {
        console.log('  No outputs found. Run production first.');
      } else {
        for (const o of outputs) {
          console.log(`  ${o.filename}  ${o.sizeMB}MB  ${o.createdAt.slice(0, 10)}`);
        }
        console.log(`\n  Total: ${outputs.length}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
