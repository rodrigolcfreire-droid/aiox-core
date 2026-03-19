#!/usr/bin/env node
'use strict';

/**
 * db-client.js — Supabase client wrapper for audiovisual schema
 * Story: AV-9.3
 *
 * Connects audiovisual modules to the Supabase database.
 * Syncs local JSON state with remote PostgreSQL tables.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { getProjectDir, loadProject } = require('./project');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
  const env = {};
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    });
  } catch { /* no .env */ }
  return { ...env, ...process.env };
}

function getConfig() {
  const env = loadEnv();
  return {
    url: env.SUPABASE_URL || '',
    key: env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || '',
  };
}

function supabaseRequest(method, tablePath, body = null) {
  const config = getConfig();
  if (!config.url || !config.key) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
  }

  const urlObj = new URL(`/rest/v1/${tablePath}`, config.url);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Supabase ${res.statusCode}: ${data}`));
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function syncProject(projectId) {
  const project = loadProject(projectId);

  const record = {
    id: project.id,
    name: project.name,
    source_url: project.sourceUrl,
    source_type: project.sourceType,
    status: project.status,
    duration_seconds: project.duration || null,
    resolution: project.resolution || null,
    metadata_json: project.metadata || {},
  };

  return supabaseRequest('POST', 'audiovisual.project?on_conflict=id', record);
}

async function syncCuts(projectId) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');

  if (!fs.existsSync(cutsPath)) return [];

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const records = cutsData.suggestedCuts.map(cut => ({
    project_id: projectId,
    category: cut.category,
    objective: cut.objective || '',
    start_time: cut.start,
    end_time: cut.end,
    blocks: cut.blocks,
    engagement_score: cut.engagementScore,
    format: cut.format,
    platform: cut.platform,
    status: cut.status,
  }));

  return supabaseRequest('POST', 'audiovisual.cut', records);
}

async function syncApprovals(projectId) {
  const projectDir = getProjectDir(projectId);
  const approvalsPath = path.join(projectDir, 'cuts', 'approvals.json');

  if (!fs.existsSync(approvalsPath)) return [];

  const data = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  const records = data.decisions.map(d => ({
    project_id: projectId,
    decision: d.decision,
    feedback: d.feedback || '',
    decided_by: d.decidedBy || 'human',
  }));

  return supabaseRequest('POST', 'audiovisual.approval', records);
}

async function syncAll(projectId) {
  const results = {};

  try {
    results.project = await syncProject(projectId);
    results.cuts = await syncCuts(projectId);
    results.approvals = await syncApprovals(projectId);
    results.success = true;
  } catch (err) {
    results.success = false;
    results.error = err.message;
  }

  return results;
}

module.exports = {
  supabaseRequest,
  syncProject,
  syncCuts,
  syncApprovals,
  syncAll,
  getConfig,
};
