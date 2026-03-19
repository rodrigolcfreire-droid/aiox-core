#!/usr/bin/env node
'use strict';

/**
 * av-transcribe.js — CLI para transcricao de video
 *
 * Comandos:
 *   node bin/av-transcribe.js <project-id>                  Transcrever via Whisper API
 *   node bin/av-transcribe.js import <project-id> <srt>     Importar SRT/VTT existente
 *
 * CLI First: Este script e a fonte da verdade para transcricao audiovisual.
 */

const path = require('path');
const { transcribeWithWhisper, importSRT } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'transcribe'));

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  Central Audiovisual — Transcription Engine');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-transcribe.js <project-id>');
    console.log('    node bin/av-transcribe.js import <project-id> <srt-or-vtt-file>');
    console.log('');
    console.log('  Requires OPENAI_API_KEY in .env for Whisper API mode.');
    console.log('  Use "import" to load existing subtitles (SRT/VTT).');
    console.log('');
    process.exit(0);
  }

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Transcription Engine');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    if (args[0] === 'import') {
      const projectId = args[1];
      const srtFile = args[2];
      if (!projectId || !srtFile) {
        console.error('  Usage: node bin/av-transcribe.js import <project-id> <srt-file>');
        process.exit(1);
      }
      const result = importSRT(projectId, srtFile);
      console.log('');
      console.log('  TRANSCRIPTION IMPORT COMPLETE');
      console.log(`  Segments: ${result.segments.length}`);
      console.log('');
    } else {
      const projectId = args[0];
      const result = await transcribeWithWhisper(projectId);
      console.log('');
      console.log('  TRANSCRIPTION COMPLETE');
      console.log(`  Segments: ${result.segments.length}`);
      console.log('');
    }
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
