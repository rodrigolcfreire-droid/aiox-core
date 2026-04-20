#!/usr/bin/env node
'use strict';

/**
 * escala-mix-render.js — Batch concat renderer for Hook×Dev×CTA combinations.
 * Story: EM-1
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require(path.resolve(__dirname, 'escala-mix-store'));

function runFFmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 8192) stderr = stderr.slice(-8192); });
    const timer = timeoutMs ? setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('FFmpeg timeout')); }, timeoutMs) : null;
    proc.on('error', err => { if (timer) clearTimeout(timer); reject(err); });
    proc.on('close', code => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function sanitize(name) {
  return (name || 'clip')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 60);
}

/**
 * Render a single combination: hook + dev + cta → output.mp4
 * Uses filter_complex concat with scaling/padding to target resolution.
 * Async via spawn — does NOT block Node event loop (SSE keeps flowing).
 */
async function renderCombo(mixId, render, opts = {}) {
  const pool = store.readPool(mixId);
  const hook = pool.hooks.find(a => a.id === render.hookId);
  const dev = pool.devs.find(a => a.id === render.devId);
  const cta = pool.ctas.find(a => a.id === render.ctaId);
  if (!hook || !dev || !cta) throw new Error(`Missing asset for render ${render.id}`);

  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const fps = opts.fps || 30;

  const outName = `${sanitize(hook.name)}__${sanitize(dev.name)}__${sanitize(cta.name)}.mp4`;
  const outPath = path.join(store.getMixDir(mixId), 'renders', outName);

  const scaleFilter = (i) => (
    `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1,fps=${fps}[v${i}]`
  );
  const audioFilter = (i) => `[${i}:a]aresample=48000,asetpts=N/SR/TB[a${i}]`;

  const filter = [
    scaleFilter(0), scaleFilter(1), scaleFilter(2),
    audioFilter(0), audioFilter(1), audioFilter(2),
    '[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]',
  ].join(';');

  const args = [
    '-y',
    '-i', hook.path,
    '-i', dev.path,
    '-i', cta.path,
    '-filter_complex', filter,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', opts.preset || 'medium', '-crf', String(opts.crf || 20),
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outPath,
  ];

  await runFFmpeg(args, 1800000);

  if (!fs.existsSync(outPath)) throw new Error(`FFmpeg did not produce output: ${outPath}`);
  return outPath;
}

/**
 * Render all pending combinations, optionally with progress callback.
 */
async function renderAll(mixId, { limit = null, onProgress = null, opts = {} } = {}) {
  let renders = store.planRenders(mixId, limit);
  store.saveRenders(mixId, renders);

  const results = [];
  for (let i = 0; i < renders.length; i++) {
    const r = renders[i];
    try {
      store.updateRender(mixId, r.id, { status: 'rendering' });
      if (onProgress) onProgress({ index: i, total: renders.length, render: r, phase: 'start' });
      const outPath = await renderCombo(mixId, r, opts);
      store.updateRender(mixId, r.id, { status: 'done', output: outPath });
      if (onProgress) onProgress({ index: i, total: renders.length, render: r, phase: 'done', output: outPath });
      results.push({ id: r.id, status: 'done', output: outPath });
    } catch (err) {
      store.updateRender(mixId, r.id, { status: 'failed', error: err.message });
      if (onProgress) onProgress({ index: i, total: renders.length, render: r, phase: 'failed', error: err.message });
      results.push({ id: r.id, status: 'failed', error: err.message });
    }
  }
  return results;
}

module.exports = { renderCombo, renderAll };
