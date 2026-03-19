#!/usr/bin/env node
'use strict';

/**
 * batch.js — Batch processing for bulk video ingestion
 * Story: AV-8.4
 *
 * Ingestao em lote: processa multiplos videos de uma vez,
 * cada um com seu proprio projeto e pipeline.
 */

const fs = require('fs');
const path = require('path');
const { ingest } = require('./ingest');
const { SUPPORTED_FORMATS } = require('./constants');

function findVideosInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = fs.readdirSync(dirPath);
  return files
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_FORMATS.includes(ext);
    })
    .map(f => path.join(dirPath, f))
    .sort();
}

async function batchIngest(sources, options = {}) {
  const results = [];
  const errors = [];
  const total = sources.length;

  console.log(`  Batch: ${total} video(s) para processar\n`);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const name = options.names ? options.names[i] : undefined;

    console.log(`  ── [${i + 1}/${total}] ${path.basename(source)} ──`);

    try {
      const result = await ingest(source, { name, brand: options.brand });
      results.push({ source, projectId: result.projectId, status: 'success' });
    } catch (err) {
      console.log(`  ERRO: ${err.message}`);
      errors.push({ source, error: err.message, status: 'error' });
    }

    console.log('');
  }

  const summary = {
    total,
    success: results.length,
    errors: errors.length,
    results,
    errorDetails: errors,
    processedAt: new Date().toISOString(),
  };

  return summary;
}

async function batchIngestFromDir(dirPath, options = {}) {
  const videos = findVideosInDir(dirPath);

  if (videos.length === 0) {
    throw new Error(`No video files found in ${dirPath}\nSupported: ${SUPPORTED_FORMATS.join(', ')}`);
  }

  return batchIngest(videos, options);
}

module.exports = {
  batchIngest,
  batchIngestFromDir,
  findVideosInDir,
};
