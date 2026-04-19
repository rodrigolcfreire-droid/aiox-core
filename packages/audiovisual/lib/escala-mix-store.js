#!/usr/bin/env node
'use strict';

/**
 * escala-mix-store.js — Data store for Escala de Criativos Mix (Hook × Dev × CTA).
 * Story: EM-1 (Escala Mix)
 *
 * Persists 3 asset pools + rendered combinations per mix.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { AV_DIR } = require(path.resolve(__dirname, 'constants'));

function generateThumb(videoPath, outPath) {
  return new Promise(resolve => {
    execFile('ffmpeg', [
      '-y', '-ss', '0.5', '-i', videoPath,
      '-vframes', '1', '-vf', 'scale=320:-2',
      '-q:v', '4', outPath,
    ], { timeout: 15000 }, err => resolve(!err && fs.existsSync(outPath)));
  });
}

const ROOT = path.join(AV_DIR, 'escala-mix');

function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true });
}

function getMixDir(mixId) {
  return path.join(ROOT, mixId);
}

function getPoolPath(mixId) {
  return path.join(getMixDir(mixId), 'pool.json');
}

function readPool(mixId) {
  const p = getPoolPath(mixId);
  if (!fs.existsSync(p)) throw new Error(`Mix not found: ${mixId}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writePool(mixId, pool) {
  fs.writeFileSync(getPoolPath(mixId), JSON.stringify(pool, null, 2));
  return pool;
}

function createMix(name) {
  ensureRoot();
  const mixId = 'mix-' + crypto.randomUUID().slice(0, 8);
  const dir = getMixDir(mixId);
  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'devs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'ctas'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  const pool = {
    mixId,
    name: name || mixId,
    hooks: [],
    devs: [],
    ctas: [],
    renders: [],
    createdAt: new Date().toISOString(),
  };
  writePool(mixId, pool);
  return pool;
}

function listMixes() {
  ensureRoot();
  return fs.readdirSync(ROOT)
    .filter(f => f.startsWith('mix-'))
    .map(f => {
      try { return readPool(f); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

async function addAsset(mixId, kind, sourcePath, name) {
  if (!['hooks', 'devs', 'ctas'].includes(kind)) {
    throw new Error(`Invalid kind "${kind}". Use hooks, devs, or ctas.`);
  }
  if (!fs.existsSync(sourcePath)) throw new Error(`File not found: ${sourcePath}`);

  const pool = readPool(mixId);
  const ext = path.extname(sourcePath) || '.mp4';
  const assetId = kind.slice(0, 1) + '_' + crypto.randomUUID().slice(0, 6);
  const dest = path.join(getMixDir(mixId), kind, `${assetId}${ext}`);
  fs.copyFileSync(sourcePath, dest);

  const thumbsDir = path.join(getMixDir(mixId), 'thumbs');
  fs.mkdirSync(thumbsDir, { recursive: true });
  const thumbPath = path.join(thumbsDir, `${assetId}.jpg`);
  const thumbOk = await generateThumb(dest, thumbPath);

  const stat = fs.statSync(dest);
  const asset = {
    id: assetId,
    name: name || path.basename(sourcePath, ext),
    path: dest,
    thumb: thumbOk ? thumbPath : null,
    sizeMB: +(stat.size / 1048576).toFixed(2),
    addedAt: new Date().toISOString(),
  };
  pool[kind].push(asset);
  writePool(mixId, pool);
  return asset;
}

function removeAsset(mixId, kind, assetId) {
  const pool = readPool(mixId);
  if (!pool[kind]) throw new Error(`Invalid kind "${kind}"`);
  const idx = pool[kind].findIndex(a => a.id === assetId);
  if (idx === -1) throw new Error(`Asset not found: ${assetId}`);
  const asset = pool[kind][idx];
  try { fs.unlinkSync(asset.path); } catch { /* ignore */ }
  pool[kind].splice(idx, 1);
  // Invalidate renders that referenced this asset
  const refKey = kind === 'hooks' ? 'hookId' : kind === 'devs' ? 'devId' : 'ctaId';
  pool.renders = pool.renders.filter(r => r[refKey] !== assetId);
  writePool(mixId, pool);
  return { removed: asset };
}

function planRenders(mixId, limit = null) {
  const pool = readPool(mixId);
  const { hooks, devs, ctas } = pool;
  if (hooks.length === 0 || devs.length === 0 || ctas.length === 0) {
    throw new Error(`All 3 pools must have at least 1 asset. Current: hooks=${hooks.length}, devs=${devs.length}, ctas=${ctas.length}`);
  }
  const combos = [];
  for (const h of hooks) {
    for (const d of devs) {
      for (const c of ctas) {
        combos.push({
          id: `r_${h.id}_${d.id}_${c.id}`,
          hookId: h.id,
          devId: d.id,
          ctaId: c.id,
          name: `${h.name}__${d.name}__${c.name}`,
          status: 'pending',
          output: null,
        });
      }
    }
  }
  const capped = limit && limit > 0 ? combos.slice(0, limit) : combos;
  return capped;
}

function saveRenders(mixId, renders) {
  const pool = readPool(mixId);
  pool.renders = renders;
  writePool(mixId, pool);
  return pool;
}

function updateRender(mixId, renderId, updates) {
  const pool = readPool(mixId);
  const r = pool.renders.find(x => x.id === renderId);
  if (!r) throw new Error(`Render not found: ${renderId}`);
  Object.assign(r, updates);
  writePool(mixId, pool);
  return r;
}

function setRenderRating(mixId, renderId, rating) {
  if (typeof rating !== 'number' || rating < 0 || rating > 5) {
    throw new Error('Rating must be a number between 0 and 5');
  }
  return updateRender(mixId, renderId, { rating });
}

/**
 * Compute average rating per asset across all rated renders.
 * Returns { hooks: {id: {avg, count}}, devs: {...}, ctas: {...} }
 */
function computeAssetScores(mixId) {
  const pool = readPool(mixId);
  const scores = { hooks: {}, devs: {}, ctas: {} };
  const init = id => ({ total: 0, count: 0, avg: 0 });

  for (const r of pool.renders || []) {
    if (typeof r.rating !== 'number') continue;
    for (const [kind, key] of [['hooks', 'hookId'], ['devs', 'devId'], ['ctas', 'ctaId']]) {
      const assetId = r[key];
      if (!assetId) continue;
      if (!scores[kind][assetId]) scores[kind][assetId] = init(assetId);
      scores[kind][assetId].total += r.rating;
      scores[kind][assetId].count += 1;
    }
  }
  for (const kind of ['hooks', 'devs', 'ctas']) {
    for (const id of Object.keys(scores[kind])) {
      const s = scores[kind][id];
      s.avg = +(s.total / s.count).toFixed(2);
    }
  }
  return scores;
}

/**
 * Ranking: sort assets by avg rating, descending. Only rated ones.
 */
function getRanking(mixId) {
  const pool = readPool(mixId);
  const scores = computeAssetScores(mixId);
  const rank = {};
  for (const kind of ['hooks', 'devs', 'ctas']) {
    rank[kind] = pool[kind]
      .map(a => ({ ...a, rating: scores[kind][a.id]?.avg ?? null, ratings: scores[kind][a.id]?.count ?? 0 }))
      .filter(a => a.rating != null)
      .sort((a, b) => b.rating - a.rating);
  }
  return rank;
}

function deleteMix(mixId) {
  const dir = getMixDir(mixId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { deleted: mixId };
}

module.exports = {
  createMix,
  listMixes,
  readPool,
  writePool,
  addAsset,
  removeAsset,
  planRenders,
  saveRenders,
  updateRender,
  setRenderRating,
  computeAssetScores,
  getRanking,
  deleteMix,
  getMixDir,
};
