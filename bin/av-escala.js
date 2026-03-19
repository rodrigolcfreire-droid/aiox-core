#!/usr/bin/env node
'use strict';

/**
 * av-escala.js — Motor: Escala de Criativos (Motor de Producao)
 *
 * Motor autonomo que opera independente do Cerebro Criativo.
 * Entrada: cortes (de qualquer origem)
 * Saida: videos prontos publicados
 *
 * Comandos:
 *   node bin/av-escala.js <project-id>                   Produzir todos os cortes aprovados
 *   node bin/av-escala.js <project-id> --cut <cut-id>    Produzir corte especifico
 *   node bin/av-escala.js <project-id> --style bold       Estilo de legenda
 *   node bin/av-escala.js <project-id> --no-subs          Sem legendas
 *   node bin/av-escala.js <project-id> --no-brand         Sem branding
 *   node bin/av-escala.js <project-id> variacoes          Gerar variacoes
 *   node bin/av-escala.js <project-id> output             Listar outputs
 *   node bin/av-escala.js <project-id> report             Relatorio de output
 *   node bin/av-escala.js list                             Listar projetos
 *
 * CLI First: Este e o motor de producao da Central Audiovisual.
 */

const fs = require('fs');
const path = require('path');
const { assemblecut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'assemble'));
const { addSubtitlesToCut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'subtitles'));
const { applyBranding } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'branding'));
const { validateCut } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'validate'));
const { generateVariations } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'scale'));
const { listOutputs, generatePackage, generateOutputReport } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'output-manager'));
const { getProjectDir, listProjects } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  ESCALA DE CRIATIVOS — Motor de Producao');
    console.log('');
    console.log('  Producao:');
    console.log('    node bin/av-escala.js <project-id>');
    console.log('    node bin/av-escala.js <project-id> --cut cut_001');
    console.log('    node bin/av-escala.js <project-id> --style bold');
    console.log('    node bin/av-escala.js <project-id> --no-subs --no-brand');
    console.log('');
    console.log('  Escala:');
    console.log('    node bin/av-escala.js <project-id> variacoes');
    console.log('    node bin/av-escala.js <project-id> variacoes --max 10');
    console.log('');
    console.log('  Output:');
    console.log('    node bin/av-escala.js <project-id> output');
    console.log('    node bin/av-escala.js <project-id> report');
    console.log('');
    console.log('  Geral:');
    console.log('    node bin/av-escala.js list');
    console.log('');
    process.exit(0);
  }

  if (args[0] === 'list') {
    const projects = listProjects();
    if (projects.length === 0) { console.log('\n  Nenhum projeto.\n'); process.exit(0); }
    console.log('\n  ── Projetos ─────────────────────────────────────');
    for (const p of projects) {
      console.log(`  ${p.id}  ${p.status.padEnd(10)}  ${p.name}`);
    }
    console.log(`\n  Total: ${projects.length}\n`);
    process.exit(0);
  }

  const projectId = args[0];
  const command = args[1];
  const cutIdx = args.indexOf('--cut');
  const styleIdx = args.indexOf('--style');
  const maxIdx = args.indexOf('--max');
  const specificCut = cutIdx !== -1 ? args[cutIdx + 1] : null;
  const style = styleIdx !== -1 ? args[styleIdx + 1] : 'minimal';
  const maxVariations = maxIdx !== -1 ? parseInt(args[maxIdx + 1]) : 20;
  const noSubs = args.includes('--no-subs');
  const noBrand = args.includes('--no-brand');

  console.log('');
  console.log('  ================================================================');
  console.log('  ESCALA DE CRIATIVOS — Motor de Producao');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');

  try {
    if (command === 'variacoes') {
      console.log('\n  ── GERANDO VARIACOES ─────────────────────────────');
      const result = generateVariations(projectId, { maxVariations });
      console.log(`  ${result.totalVariations} variacoes geradas`);
      for (const v of result.variations) {
        console.log(`  ${v.id}  ${v.type.padEnd(18)}  ${v.duration.toFixed(0)}s  ${v.description}`);
      }
      console.log('');

    } else if (command === 'output') {
      const outputs = listOutputs(projectId);
      if (outputs.length === 0) { console.log('\n  Nenhum output.\n'); process.exit(0); }
      console.log('\n  ── Outputs ──────────────────────────────────────');
      for (const o of outputs) {
        console.log(`  ${o.filename}  ${o.sizeMB}MB  ${new Date(o.createdAt).toLocaleDateString('pt-BR')}`);
      }
      console.log(`\n  Total: ${outputs.length}\n`);

    } else if (command === 'report') {
      const report = generateOutputReport(projectId);
      console.log(`\n  Projeto: ${report.project.name}`);
      console.log(`  Outputs: ${report.totalOutputs}`);
      console.log(`  Tamanho total: ${report.totalSizeMB} MB`);
      console.log(`  Render: ${report.renderStatus.rendered}/${report.renderStatus.total}`);
      console.log('');

    } else {
      // Production pipeline
      const projectDir = getProjectDir(projectId);
      const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
      if (!fs.existsSync(cutsPath)) {
        throw new Error('Nenhum corte encontrado. Execute primeiro: node bin/av-cortes.js <video>');
      }

      const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
      const cuts = specificCut
        ? cutsData.suggestedCuts.filter(c => c.id === specificCut)
        : cutsData.suggestedCuts.filter(c => c.status === 'approved');

      if (cuts.length === 0) {
        if (specificCut) {
          throw new Error(`Corte ${specificCut} nao encontrado`);
        }
        console.log('\n  Nenhum corte aprovado. Aprovando todos automaticamente...');
        const allCuts = cutsData.suggestedCuts;
        for (const c of allCuts) c.status = 'approved';
        fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));
        cuts.push(...allCuts);
      }

      console.log(`\n  Produzindo ${cuts.length} corte(s)...\n`);

      for (const cut of cuts) {
        console.log(`  ── ${cut.id} [${cut.category}] ${cut.duration.toFixed(0)}s ${cut.format} ──`);

        // Assembly
        assemblecut(projectId, cut.id);

        // Subtitles
        if (!noSubs) {
          addSubtitlesToCut(projectId, cut.id, style);
        }

        // Branding
        if (!noBrand) {
          applyBranding(projectId, cut.id);
        }

        // Validate
        const validation = validateCut(projectId, cut.id);
        const status = validation.passed ? 'PASS' : 'FAIL';
        console.log(`  Qualidade: ${status} (${validation.qualityScore}/10)`);
        console.log('');
      }

      console.log('  ================================================================');
      console.log('  PRODUCAO COMPLETA');
      console.log(`  ${cuts.length} video(s) produzidos`);
      console.log('');
      console.log('  Ver outputs:');
      console.log(`    node bin/av-escala.js ${projectId} output`);
      console.log('  ================================================================');
      console.log('');
    }
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

main();
