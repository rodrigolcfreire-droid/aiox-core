#!/usr/bin/env node
'use strict';

/**
 * av-cortes.js — Motor: Cortes Inteligentes (Cerebro Criativo)
 *
 * Motor autonomo que opera independente do Motor de Producao.
 * Entrada: video bruto
 * Saida: cortes sugeridos/aprovados
 *
 * Comandos:
 *   node bin/av-cortes.js <video>                   Pipeline completo (ingest→transcreve→segmenta→cortes→describe)
 *   node bin/av-cortes.js <project-id> status        Status do projeto
 *   node bin/av-cortes.js <project-id> approve       Aprovar cortes
 *   node bin/av-cortes.js <project-id> approve-all   Aprovar todos
 *   node bin/av-cortes.js <project-id> reject <cut>  Rejeitar corte
 *   node bin/av-cortes.js <project-id> learn          Aprender com decisoes
 *   node bin/av-cortes.js <project-id> playbook       Gerar playbook
 *   node bin/av-cortes.js list                        Listar projetos
 *
 * CLI First: Este e o cerebro criativo da Central Audiovisual.
 */

const fs = require('fs');
const path = require('path');
const { ingest } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'ingest'));
const { transcribeWithWhisper, importSRT } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'transcribe'));
const { segmentVideo } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'segment'));
const { generateSmartCuts } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'smart-cuts'));
const { generateDescription } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'describe'));
const { approveCut, rejectCut, approveAll, getApprovalSummary } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'approval'));
const { learnFromProject, getLearningInsights } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'learning'));
const { generatePlaybook } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'playbook'));
const { listProjects, loadProject } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));
const { downloadFromDrive, extractFileId } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'drive-stream'));

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function runFullPipeline(source, options = {}) {
  console.log('');
  console.log('  ================================================================');
  console.log('  CORTES INTELIGENTES — Cerebro Criativo');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');

  // 1. Ingest (use Drive API if Drive link detected)
  console.log('\n  ── 1/5 INGESTAO ─────────────────────────────────');
  let result;
  if (source.includes('drive.google.com')) {
    // Download via Drive API (authenticated)
    console.log('  Google Drive detectado — usando API autenticada');
    const { generateProjectId, createProjectStructure, getProjectDir, updateProjectStatus, updateProject } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));
    const { extractMetadata } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'ffprobe'));
    const { PROJECT_STATUS } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'constants'));

    const fileId = extractFileId(source);
    const projectId = generateProjectId();
    const project = createProjectStructure(projectId, options.name || fileId, 'drive', source);
    const projectDir = getProjectDir(projectId);

    updateProjectStatus(projectId, PROJECT_STATUS.INGESTING);
    const destPath = path.join(projectDir, 'source', 'video.mov');
    const { metadata: driveMetadata } = await downloadFromDrive(source, destPath);

    updateProjectStatus(projectId, PROJECT_STATUS.ANALYZING);
    console.log('  Running FFprobe...');
    const metadata = extractMetadata(destPath);
    const fs = require('fs');
    fs.writeFileSync(path.join(projectDir, 'analysis', 'metadata.json'), JSON.stringify(metadata, null, 2));
    updateProject(projectId, { status: PROJECT_STATUS.ANALYZED, duration: metadata.durationSeconds, resolution: metadata.resolution, metadata });

    console.log(`  Project ID: ${projectId}`);
    console.log(`  Duration:   ${metadata.duration}`);
    console.log(`  Resolution: ${metadata.resolution}`);
    result = { projectId, project, metadata, videoPath: destPath };
  } else {
    result = await ingest(source, options);
  }

  // 2. Transcribe
  console.log('\n  ── 2/5 TRANSCRICAO ──────────────────────────────');
  if (options.srt) {
    importSRT(result.projectId, options.srt);
  } else {
    try {
      await transcribeWithWhisper(result.projectId);
    } catch (err) {
      console.log(`  Whisper API indisponivel: ${err.message}`);
      console.log('  Use: node bin/av-cortes.js <video> --srt <arquivo.srt>');
      console.log(`  Projeto criado: ${result.projectId}`);
      return result;
    }
  }

  // 3. Segment
  console.log('\n  ── 3/5 SEGMENTACAO ──────────────────────────────');
  const segments = segmentVideo(result.projectId);
  console.log(`  ${segments.totalBlocks} blocos identificados`);

  // 4. Smart Cuts
  console.log('\n  ── 4/5 CORTES INTELIGENTES ──────────────────────');
  const cuts = generateSmartCuts(result.projectId);
  console.log(`  ${cuts.totalSuggested} cortes sugeridos`);
  for (const cut of cuts.suggestedCuts.slice(0, 5)) {
    console.log(`  ${cut.id}  ${cut.category.padEnd(12)}  ${cut.duration.toFixed(0)}s  score:${cut.engagementScore}  ${cut.platform.join(',')}`);
  }
  if (cuts.totalSuggested > 5) console.log(`  ... +${cuts.totalSuggested - 5} mais`);

  // 5. Describe
  console.log('\n  ── 5/5 DESCRICAO ────────────────────────────────');
  const desc = generateDescription(result.projectId);
  console.log(`  Resumo: ${desc.summary.slice(0, 100)}...`);
  console.log(`  Keywords: ${desc.keywords.slice(0, 5).map(k => k.word).join(', ')}`);

  console.log('');
  console.log('  ================================================================');
  console.log('  CEREBRO CRIATIVO COMPLETO');
  console.log(`  Projeto: ${result.projectId}`);
  console.log(`  Cortes: ${cuts.totalSuggested} sugeridos (aguardando aprovacao)`);
  console.log('');
  console.log('  Proximo passo:');
  console.log(`    node bin/av-cortes.js ${result.projectId} approve-all`);
  console.log(`    node bin/av-cortes.js ${result.projectId} approve cut_001`);
  console.log('  ================================================================');
  console.log('');

  return result;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  CORTES INTELIGENTES — Cerebro Criativo');
    console.log('');
    console.log('  Pipeline completo:');
    console.log('    node bin/av-cortes.js <video.mp4>');
    console.log('    node bin/av-cortes.js <video.mp4> --srt legenda.srt');
    console.log('    node bin/av-cortes.js <drive-url>');
    console.log('');
    console.log('  Aprovacao:');
    console.log('    node bin/av-cortes.js <project-id> status');
    console.log('    node bin/av-cortes.js <project-id> approve <cut-id>');
    console.log('    node bin/av-cortes.js <project-id> approve-all');
    console.log('    node bin/av-cortes.js <project-id> reject <cut-id> [motivo]');
    console.log('');
    console.log('  Aprendizado:');
    console.log('    node bin/av-cortes.js <project-id> learn');
    console.log('    node bin/av-cortes.js <project-id> playbook');
    console.log('');
    console.log('  Geral:');
    console.log('    node bin/av-cortes.js list');
    console.log('');
    process.exit(0);
  }

  // List projects
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

  const command = args[1];

  // If no command, treat first arg as video source → run full pipeline
  if (!command || args[0].includes('.') || args[0].includes('/') || args[0].includes('http')) {
    const srtIdx = args.indexOf('--srt');
    const srt = srtIdx !== -1 ? args[srtIdx + 1] : null;
    const nameIdx = args.indexOf('--name');
    const name = nameIdx !== -1 ? args[nameIdx + 1] : null;
    await runFullPipeline(args[0], { srt, name });
    process.exit(0);
  }

  // Project-level commands
  const projectId = args[0];

  try {
    if (command === 'status') {
      const summary = getApprovalSummary(projectId);
      console.log(`\n  Projeto: ${projectId}`);
      console.log(`  Total: ${summary.total} | Aprovados: ${summary.approved} | Rejeitados: ${summary.rejected} | Pendentes: ${summary.pending}`);
      for (const c of summary.cuts) {
        const icon = c.status === 'approved' ? '+' : c.status === 'rejected' ? 'x' : '?';
        console.log(`  [${icon}] ${c.id}  ${c.status.padEnd(10)}  ${c.category}  score:${c.engagementScore}`);
      }
      console.log('');
    } else if (command === 'approve') {
      const cutId = args[2];
      if (!cutId) { console.error('  Cut ID necessario'); process.exit(1); }
      approveCut(projectId, cutId, args.slice(3).join(' '));
      console.log(`\n  APROVADO: ${cutId}\n`);
    } else if (command === 'approve-all') {
      const results = approveAll(projectId);
      console.log(`\n  ${results.length} cortes aprovados\n`);
    } else if (command === 'reject') {
      const cutId = args[2];
      if (!cutId) { console.error('  Cut ID necessario'); process.exit(1); }
      rejectCut(projectId, cutId, args.slice(3).join(' '));
      console.log(`\n  REJEITADO: ${cutId}\n`);
    } else if (command === 'learn') {
      const learnings = learnFromProject(projectId);
      console.log(`\n  ${learnings.patterns.length} padroes aprendidos`);
      const insights = getLearningInsights(projectId);
      for (const i of insights.insights) console.log(`  - ${i}`);
      console.log('');
    } else if (command === 'playbook') {
      const pb = generatePlaybook(projectId);
      console.log(`\n  Playbook: ${pb.title}`);
      for (const r of pb.recommendations) console.log(`  - [${r.area}] ${r.action}`);
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

main();
