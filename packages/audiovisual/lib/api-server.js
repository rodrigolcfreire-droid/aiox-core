#!/usr/bin/env node
'use strict';

/**
 * api-server.js — HTTP API server for Central Audiovisual
 * Story: AV-9.1
 *
 * Native Node.js HTTP server (zero deps) that wraps all
 * audiovisual CLIs as REST endpoints.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Modules
const { ingest } = require('./ingest');
const { listProjects, loadProject, getProjectDir } = require('./project');
const { transcribeWithWhisper, importSRT } = require('./transcribe');
const { segmentVideo } = require('./segment');
const { generateSmartCuts } = require('./smart-cuts');
const { generateDescription } = require('./describe');
const { approveCut, rejectCut, approveAll, getApprovalSummary } = require('./approval');
const { learnFromProject, getLearningInsights } = require('./learning');
const { generatePlaybook } = require('./playbook');
const { generateVariations } = require('./scale');
const { generateSuggestions } = require('./suggestions');
const { registerMetrics, analyzePerformance } = require('./performance');
const { listOutputs, generateOutputReport } = require('./output-manager');
const { addBrand, updateBrand, removeBrand, listBrands, getBrand } = require('./brand-catalog');
const { generateThumbnail, generateCutThumbnails } = require('./thumbnail');

const DEFAULT_PORT = 3456;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;
  const method = req.method;

  try {
    // ── Projects ──────────────────────────────────────
    if (pathname === '/api/projects' && method === 'GET') {
      return sendJSON(res, { projects: listProjects() });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, { project: loadProject(id) });
    }

    // ── Ingest ────────────────────────────────────────
    if (pathname === '/api/ingest' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.source) return sendError(res, 'source required');
      const result = await ingest(body.source, { name: body.name, brand: body.brand });
      return sendJSON(res, result, 201);
    }

    // ── Transcribe ────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/transcribe$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = await transcribeWithWhisper(id);
      return sendJSON(res, result);
    }

    // ── Segment ───────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/segment$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = segmentVideo(id);
      return sendJSON(res, result);
    }

    // ── Cuts ──────────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/cuts$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = generateSmartCuts(id);
      return sendJSON(res, result);
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/cuts$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const cutsPath = path.join(getProjectDir(id), 'cuts', 'suggested-cuts.json');
      if (!fs.existsSync(cutsPath)) return sendJSON(res, { suggestedCuts: [] });
      return sendJSON(res, JSON.parse(fs.readFileSync(cutsPath, 'utf8')));
    }

    // ── Describe ──────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/describe$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = generateDescription(id);
      return sendJSON(res, result);
    }

    // ── Approval ──────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/approve$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (body.all) {
        const results = approveAll(id);
        return sendJSON(res, { approved: results.length });
      }
      if (!body.cutId) return sendError(res, 'cutId required');
      const result = approveCut(id, body.cutId, body.feedback || '');
      return sendJSON(res, result);
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/reject$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.cutId) return sendError(res, 'cutId required');
      const result = rejectCut(id, body.cutId, body.feedback || '');
      return sendJSON(res, result);
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/approval-summary$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, getApprovalSummary(id));
    }

    // ── Learn ─────────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/learn$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      return sendJSON(res, learnFromProject(id));
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/insights$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, getLearningInsights(id));
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/playbook$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      return sendJSON(res, generatePlaybook(id));
    }

    // ── Suggestions ───────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/suggestions$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, generateSuggestions(id));
    }

    // ── Variations ────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/variations$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      return sendJSON(res, generateVariations(id, { maxVariations: body.max || 20 }));
    }

    // ── Performance ───────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/performance$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.cutId) return sendError(res, 'cutId required');
      return sendJSON(res, registerMetrics(id, body.cutId, body));
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/performance$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, analyzePerformance(id));
    }

    // ── Outputs ───────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/outputs$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, { outputs: listOutputs(id) });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/report$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, generateOutputReport(id));
    }

    // ── Thumbnails ────────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/thumbnails$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = generateCutThumbnails(id);
      return sendJSON(res, result);
    }

    // Serve thumbnail image
    if (pathname.match(/^\/api\/projects\/[^/]+\/thumbnails\/[^/]+\.jpg$/) && method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const filename = parts[5];
      const thumbPath = path.join(getProjectDir(id), 'cuts', 'thumbnails', filename);
      if (!fs.existsSync(thumbPath)) return sendError(res, 'Thumbnail not found', 404);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(thumbPath).pipe(res);
    }

    // ── Brands ────────────────────────────────────────
    if (pathname === '/api/brands' && method === 'GET') {
      return sendJSON(res, { brands: listBrands() });
    }

    if (pathname === '/api/brands' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.name) return sendError(res, 'name required');
      return sendJSON(res, addBrand(body.name, body), 201);
    }

    if (pathname.match(/^\/api\/brands\/[^/]+$/) && method === 'GET') {
      const slug = pathname.split('/')[3];
      return sendJSON(res, getBrand(slug));
    }

    if (pathname.match(/^\/api\/brands\/[^/]+$/) && method === 'PUT') {
      const slug = pathname.split('/')[3];
      const body = await parseBody(req);
      return sendJSON(res, updateBrand(slug, body));
    }

    if (pathname.match(/^\/api\/brands\/[^/]+$/) && method === 'DELETE') {
      const slug = pathname.split('/')[3];
      return sendJSON(res, removeBrand(slug));
    }

    // ── Health ────────────────────────────────────────
    if (pathname === '/api/health') {
      return sendJSON(res, { status: 'ok', service: 'central-audiovisual', timestamp: new Date().toISOString() });
    }

    // 404
    sendError(res, `Not found: ${method} ${pathname}`, 404);

  } catch (err) {
    sendError(res, err.message, 500);
  }
}

function createServer(port = DEFAULT_PORT) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log('');
    console.log('  ================================================================');
    console.log('  CENTRAL AUDIOVISUAL — API Server');
    console.log(`  http://localhost:${port}`);
    console.log(`  ${new Date().toLocaleString('pt-BR')}`);
    console.log('  ================================================================');
    console.log('');
    console.log('  Endpoints:');
    console.log('    GET  /api/health');
    console.log('    GET  /api/projects');
    console.log('    POST /api/ingest                        { source, name?, brand? }');
    console.log('    POST /api/projects/:id/transcribe');
    console.log('    POST /api/projects/:id/segment');
    console.log('    POST /api/projects/:id/cuts');
    console.log('    GET  /api/projects/:id/cuts');
    console.log('    POST /api/projects/:id/describe');
    console.log('    POST /api/projects/:id/approve          { cutId | all:true }');
    console.log('    POST /api/projects/:id/reject           { cutId, feedback? }');
    console.log('    GET  /api/projects/:id/approval-summary');
    console.log('    POST /api/projects/:id/learn');
    console.log('    GET  /api/projects/:id/insights');
    console.log('    POST /api/projects/:id/playbook');
    console.log('    GET  /api/projects/:id/suggestions');
    console.log('    POST /api/projects/:id/variations       { max? }');
    console.log('    POST /api/projects/:id/performance      { cutId, views, likes, ... }');
    console.log('    GET  /api/projects/:id/performance');
    console.log('    GET  /api/projects/:id/outputs');
    console.log('    GET  /api/projects/:id/report');
    console.log('    POST /api/projects/:id/thumbnails');
    console.log('    GET  /api/projects/:id/thumbnails/:file');
    console.log('    GET  /api/brands');
    console.log('    POST /api/brands                        { name, logo?, ... }');
    console.log('    GET  /api/brands/:slug');
    console.log('    PUT  /api/brands/:slug                  { updates }');
    console.log('    DELETE /api/brands/:slug');
    console.log('');
  });
  return server;
}

module.exports = { createServer, handleRequest, DEFAULT_PORT };
