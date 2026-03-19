#!/usr/bin/env node
'use strict';

/**
 * av-produce.js — CLI para pipeline de producao completo
 *
 * Comandos:
 *   node bin/av-produce.js <project-id>                    Pipeline completo (todos os cortes)
 *   node bin/av-produce.js <project-id> --cut <cut-id>     Produzir um corte especifico
 *   node bin/av-produce.js <project-id> --style <style>    Estilo de legenda (minimal/bold/karaoke/subtitle)
 *   node bin/av-produce.js <project-id> --no-subs          Sem legendas
 *   node bin/av-produce.js <project-id> --no-brand         Sem branding
 *
 * CLI First: Este script e a fonte da verdade para producao audiovisual.
 */

const path = require('path');
const fs = require('fs');
const { assemblecut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'assemble'));
const { addSubtitlesToCut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'subtitles'));
const { applyBranding } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'branding'));
const { validateCut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'validate'));
const { getProjectDir } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Production Pipeline');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-produce.js <project-id>');
    console.log('    node bin/av-produce.js <project-id> --cut cut_001');
    console.log('    node bin/av-produce.js <project-id> --style bold');
    console.log('    node bin/av-produce.js <project-id> --no-subs');
    console.log('    node bin/av-produce.js <project-id> --no-brand');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];
  const cutIdx = args.indexOf('--cut');
  const styleIdx = args.indexOf('--style');
  const specificCut = cutIdx !== -1 ? args[cutIdx + 1] : null;
  const style = styleIdx !== -1 ? args[styleIdx + 1] : 'minimal';
  const noSubs = args.includes('--no-subs');
  const noBrand = args.includes('--no-brand');

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Production Pipeline');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');

  try {
    const projectDir = getProjectDir(projectId);
    const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
    if (!fs.existsSync(cutsPath)) {
      throw new Error('No cuts found. Run smart cuts first: node bin/av-cuts.js <project-id>');
    }

    const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
    const cuts = specificCut
      ? cutsData.suggestedCuts.filter(c => c.id === specificCut)
      : cutsData.suggestedCuts;

    if (cuts.length === 0) {
      throw new Error(specificCut ? `Cut ${specificCut} not found` : 'No cuts to produce');
    }

    console.log(`\n  Processing ${cuts.length} cut(s)...\n`);

    for (const cut of cuts) {
      console.log(`  ── ${cut.id} ──────────────────────────────────`);

      // Step 1: Assemble
      assemblecut(projectId, cut.id);

      // Step 2: Subtitles
      if (!noSubs) {
        addSubtitlesToCut(projectId, cut.id, style);
      }

      // Step 3: Branding
      if (!noBrand) {
        applyBranding(projectId, cut.id);
      }

      // Step 4: Validate
      const validation = validateCut(projectId, cut.id);
      const status = validation.passed ? 'PASS' : 'FAIL';
      console.log(`  Quality: ${status} (score: ${validation.qualityScore}/10)`);
      console.log('');
    }

    console.log('  ================================================================');
    console.log('  PRODUCTION COMPLETE');
    console.log(`  ${cuts.length} video(s) produced`);
    console.log('  ================================================================');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
