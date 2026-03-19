#!/usr/bin/env node
'use strict';

/**
 * av-ingest.js — CLI para ingestao de video na Central Audiovisual
 *
 * Comandos:
 *   node bin/av-ingest.js <video-path-or-url>     Ingerir video
 *   node bin/av-ingest.js --name "Nome" <source>   Ingerir com nome customizado
 *   node bin/av-ingest.js list                     Listar projetos
 *   node bin/av-ingest.js status <project-id>      Status de um projeto
 *
 * CLI First: Este script e a fonte da verdade para ingestao audiovisual.
 */

const path = require('path');
const { ingest } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'ingest'));
const { listProjects, loadProject } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'project'));

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  Central Audiovisual — Ingest Pipeline');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-ingest.js <video-path-or-url>');
    console.log('    node bin/av-ingest.js --name "Meu Video" <source>');
    console.log('    node bin/av-ingest.js list');
    console.log('    node bin/av-ingest.js status <project-id>');
    console.log('');
    console.log('  Supported formats: .mp4, .mov, .avi, .mkv, .webm, .m4v');
    console.log('  Supported sources: local file, Google Drive URL, direct URL');
    console.log('');
    process.exit(0);
  }

  const command = args[0];

  // List projects
  if (command === 'list') {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log('\n  No projects found.\n');
      process.exit(0);
    }
    console.log('');
    console.log('  ── Projects ──────────────────────────────────────');
    for (const p of projects) {
      const date = new Date(p.createdAt).toLocaleDateString('pt-BR');
      console.log(`  ${p.id}  ${p.status.padEnd(10)}  ${date}  ${p.name}`);
    }
    console.log(`\n  Total: ${projects.length}\n`);
    process.exit(0);
  }

  // Project status
  if (command === 'status') {
    const projectId = args[1];
    if (!projectId) {
      console.error('  Error: project ID required');
      process.exit(1);
    }
    try {
      const project = loadProject(projectId);
      console.log('');
      console.log('  ── Project Status ────────────────────────────────');
      console.log(`  ID:         ${project.id}`);
      console.log(`  Name:       ${project.name}`);
      console.log(`  Status:     ${project.status}`);
      console.log(`  Source:     ${project.sourceType}`);
      console.log(`  Created:    ${project.createdAt}`);
      if (project.metadata) {
        console.log(`  Duration:   ${project.metadata.duration}`);
        console.log(`  Resolution: ${project.metadata.resolution}`);
      }
      console.log('');
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Ingest video
  let name = null;
  let source = command;

  // Parse --name flag
  const nameIdx = args.indexOf('--name');
  if (nameIdx !== -1 && args[nameIdx + 1]) {
    name = args[nameIdx + 1];
    source = args.find((a, i) => i !== nameIdx && i !== nameIdx + 1 && !a.startsWith('--'));
  }

  if (!source) {
    console.error('  Error: video source required');
    process.exit(1);
  }

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Ingest Pipeline');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    const result = await ingest(source, { name });
    console.log('');
    console.log('  ================================================================');
    console.log('  INGEST COMPLETE');
    console.log(`  Project ID: ${result.projectId}`);
    console.log('  ================================================================');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
