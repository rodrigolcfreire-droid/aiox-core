#!/usr/bin/env node
'use strict';

/**
 * av-segment.js — CLI para segmentacao de video
 *
 * Comandos:
 *   node bin/av-segment.js <project-id>     Segmentar video em blocos
 *
 * CLI First: Este script e a fonte da verdade para segmentacao audiovisual.
 */

const path = require('path');
const { segmentVideo } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'segment'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  Central Audiovisual — Video Segmentation');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-segment.js <project-id>');
    console.log('');
    console.log('  Requires transcription to exist (run av-transcribe.js first).');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Video Segmentation');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    const result = segmentVideo(projectId);

    console.log('  ── Blocks ──────────────────────────────────────');
    for (const block of result.blocks) {
      const start = formatTime(block.start);
      const end = formatTime(block.end);
      const dur = block.duration.toFixed(1);
      console.log(`  ${block.id}  [${start} → ${end}]  ${dur}s  ${block.type.padEnd(10)}  ${block.energyLevel.padEnd(6)}  ${block.title}`);
    }

    console.log('');
    console.log('  ── Summary ──────────────────────────────────────');
    console.log(`  Total blocks: ${result.totalBlocks}`);
    console.log(`  Total duration: ${formatTime(result.totalDuration)}`);
    console.log(`  Avg block duration: ${result.averageBlockDuration.toFixed(1)}s`);
    console.log('');
    console.log('  SEGMENTATION COMPLETE');
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

main();
