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
const { logAccess, logRateLimitHit, getSecurityStatus } = require('./security-monitor');
const { startSecurityAlerts, sendIntrusionAlert, sendAccessAlert, sendRateLimitAlert } = require('./security-alerts');
const { startSecurityBot } = require('./security-bot');
const { ingest } = require('./ingest');
const { listProjects, loadProject, getProjectDir, cleanupOldProjects } = require('./project');
const { PROJECT_MAX_AGE_DAYS } = require('./constants');
const { transcribeWithWhisper, importSRT } = require('./transcribe');
const { segmentVideo } = require('./segment');
const { generateSmartCuts } = require('./smart-cuts');
const { generateDescription } = require('./describe');
const { approveCut, rejectCut, approveAll, getApprovalSummary } = require('./approval');
const { generateCutPreviews, assembleAllApproved } = require('./assemble');
const { learnFromProject, getLearningInsights } = require('./learning');
const { generatePlaybook } = require('./playbook');
const { generateVariations } = require('./scale');
const { generateSuggestions } = require('./suggestions');
const { registerMetrics, analyzePerformance } = require('./performance');
const { listOutputs, generateOutputReport } = require('./output-manager');
const { runLivePipeline, addClient, removeClient, getPipelineState } = require('./live-pipeline');
const { addBrand, updateBrand, removeBrand, listBrands, getBrand } = require('./brand-catalog');
const { generateThumbnail, generateCutThumbnails } = require('./thumbnail');
const { detectEnergy, loadEnergyData } = require('./energy-detector');
const { exportPremiereXml } = require('./export-premiere-xml');
const { exportDaVinciXml } = require('./export-davinci-xml');
const { buildExportPackage, getExportHistory } = require('./export-package');
const editStore = require('./edit-store');
const subtitlePresets = require('./subtitle-presets');
const { exportEdit, EXPORTS_DIR: EDIT_EXPORTS_DIR } = require('./edit-export');

const DEFAULT_PORT = 3456;

// Rate limiting — per IP (zero deps)
const RATE_LIMIT_EXTERNAL = 60;  // external IPs: 60/min
const RATE_LIMIT_LOCAL = 500;    // localhost: 500/min (polling, SSE, etc)
const RATE_WINDOW = 60000;       // 1 minute
const rateLimitMap = new Map();

function checkRateLimit(req, res) {
  const ip = req.socket.remoteAddress || '127.0.0.1';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const limit = isLocal ? RATE_LIMIT_LOCAL : RATE_LIMIT_EXTERNAL;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip).filter(t => now - t < RATE_WINDOW);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (timestamps.length > limit) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' });
    res.end(JSON.stringify({ error: `Rate limit: ${timestamps.length}/${limit} req/min`, limit }));
    return false;
  }

  return true;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    const valid = timestamps.filter(t => now - t < RATE_WINDOW);
    if (valid.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, valid);
  }
}, 300000);

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

// Simple auth — protects dashboard from unauthorized access
const AUTH_PASSWORD = process.env.AIOS_PASSWORD || 'aios2026';
const AUTH_COOKIE = 'aios_session';
const crypto = require('crypto');
const AUTH_TOKEN = crypto.createHash('sha256').update(AUTH_PASSWORD).digest('hex').substring(0, 32);

// Public routes (no auth required). Login + health only.
const AUTH_PUBLIC_PATHS = new Set(['/api/login', '/api/health', '/health', '/favicon.ico']);

function checkAuth(req, res) {
  const pathname = url.parse(req.url).pathname;

  // Public endpoints bypass auth
  if (AUTH_PUBLIC_PATHS.has(pathname)) return true;

  // 1. Cookie auth
  const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k) acc[k] = v;
    return acc;
  }, {});
  if (cookies[AUTH_COOKIE] === AUTH_TOKEN) return true;

  // 2. Authorization header (Bearer token)
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === AUTH_TOKEN) return true;

  // 3. Query param ?token=
  const tokenParam = url.parse(req.url, true).query.token;
  if (tokenParam === AUTH_TOKEN) return true;

  return false;
}

function serveLoginPage(res) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>AIOS — Login</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0e1a;color:#e2e8f0;font-family:Inter,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:rgba(26,31,46,0.9);border:1px solid rgba(255,255,255,0.1);padding:48px;border-radius:16px;text-align:center;width:100%;max-width:400px;box-shadow:0 0 60px rgba(0,229,204,0.08)}
h1{font-family:'Chakra Petch',sans-serif;font-size:28px;background:linear-gradient(135deg,#00e5cc,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
p{font-size:13px;color:#64748b;margin-bottom:24px}
input{width:100%;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px;color:#e2e8f0;font-size:16px;text-align:center;outline:none;letter-spacing:4px;margin-bottom:16px}
input:focus{border-color:#00e5cc}
button{width:100%;background:linear-gradient(135deg,#00e5cc,#38bdf8);color:#0a0e1a;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer}
.err{color:#f87171;font-size:13px;margin-top:12px;display:none}</style></head>
<body><div class="box"><h1>CENTRO DE COMANDO</h1><p>Digite a senha para acessar</p>
<form onsubmit="login(event)"><input type="password" id="pwd" placeholder="••••••••" autofocus>
<button type="submit">ENTRAR</button></form><div class="err" id="err">Senha incorreta</div></div>
<script>async function login(e){e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pwd').value})});if(r.ok){const d=await r.json();if(d.token)sessionStorage.setItem('aios_token',d.token);location.reload()}else{document.getElementById('err').style.display='block'}}</script></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.end(html);
}

async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // Auth check — show login page for HTML paths, return 401 for API paths
  if (!checkAuth(req, res)) {
    const pathname = url.parse(req.url).pathname;
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Authentication required' }));
    }
    serveLoginPage(res);
    return;
  }

  // Handle login
  if (req.url === '/api/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if (body.password === AUTH_PASSWORD) {
      const loginIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      sendAccessAlert(loginIP, 'Login no Centro de Comando').catch(() => {});
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `${AUTH_COOKIE}=${AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      });
      return res.end(JSON.stringify({ ok: true, token: AUTH_TOKEN }));
    }
    // Failed login — send red alert
    const failIP = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    sendIntrusionAlert(failIP, '443', 'Tentativa de login com senha INCORRETA').catch(() => {});
    return sendError(res, 'Invalid password', 401);
  }

  // Log access for security monitoring
  if (req.url.startsWith('/api/')) logAccess(req);

  // External access tracking (only log, alerts handled by login flow)

  // Rate limit check (skip for SSE, static files, polling, upload chunks, health)
  const isSSE = req.url.includes('/events');
  const isStatic = !req.url.startsWith('/api/');
  const isPolling = req.url.includes('/state') || req.url.includes('/health');
  const isUploadChunk = req.url.includes('/upload/chunk');
  if (!isSSE && !isStatic && !isPolling && !isUploadChunk && !checkRateLimit(req, res)) {
    logRateLimitHit(req);
    const ip = req.socket.remoteAddress || '127.0.0.1';
    sendRateLimitAlert(ip, RATE_LIMIT).catch(() => {});
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;
  const method = req.method;

  try {
    // ── Token endpoint — lets the browser retrieve auth token after cookie login
    if (pathname === '/api/token' && method === 'GET') {
      return sendJSON(res, { token: AUTH_TOKEN });
    }

    // ── Projects ──────────────────────────────────────
    if (pathname === '/api/projects' && method === 'GET') {
      return sendJSON(res, { projects: listProjects() });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, { project: loadProject(id) });
    }

    // ── Rename / Update project ──────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+$/) && method === 'PATCH') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const allowed = {};
      if (body.name && typeof body.name === 'string') allowed.name = body.name.trim();
      if (!Object.keys(allowed).length) return sendError(res, 'Nothing to update');
      const { updateProject } = require('./project');
      const updated = updateProject(id, allowed);
      return sendJSON(res, { project: updated });
    }

    // ── Batch Processing (AV-12) ─────────────────────
    if (pathname === '/api/batch' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.sources || !Array.isArray(body.sources)) return sendError(res, 'sources array required');
      const { batchIngest } = require('./batch');
      const result = await batchIngest(body.sources, { brand: body.brand });
      return sendJSON(res, result);
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

    // ── Finalize: assemble approved cuts → output ────
    if (pathname.match(/^\/api\/projects\/[^/]+\/finalize$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const assembled = assembleAllApproved(id);

      // Copy final files to output/ — prefer subtitled over assembled
      const outputDir = path.join(getProjectDir(id), 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      const finals = [];
      for (const a of assembled) {
        const finalPath = path.join(outputDir, `final-${a.cutId}.mp4`);
        // Use subtitled version if it exists (has burned-in animated captions)
        const subtitledPath = a.outputPath.replace('assembled-', 'subtitled-');
        const sourcePath = fs.existsSync(subtitledPath) ? subtitledPath : a.outputPath;
        fs.copyFileSync(sourcePath, finalPath);
        const stat = fs.statSync(finalPath);
        finals.push({
          cutId: a.cutId,
          filename: `final-${a.cutId}.mp4`,
          sizeMB: parseFloat((stat.size / 1048576).toFixed(1)),
          duration: a.duration,
          hookPrepended: a.hookPrepended,
          downloadUrl: `/api/projects/${id}/download/final-${a.cutId}.mp4`,
        });
      }
      return sendJSON(res, { finalized: finals.length, files: finals });
    }

    // ── Download final video ───────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/download\/[^/]+\.mp4$/) && method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const filename = parts[5];
      const filePath = path.join(getProjectDir(id), 'output', filename);
      if (!fs.existsSync(filePath)) return sendError(res, 'File not found', 404);
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
      });
      return fs.createReadStream(filePath).pipe(res);
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

    // ── XML Export (AV-13) ─────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/export\/xml\/premiere$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.mode) return sendError(res, 'mode required (single, approved, final)');
      if (body.mode === 'single' && !body.cutId) return sendError(res, 'cutId required for single mode');
      const result = exportPremiereXml(id, body.mode, body.cutId);
      return sendJSON(res, { filename: result.filename, clipCount: result.clipCount, totalDuration: result.totalDuration, editor: 'premiere', mode: body.mode });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/export\/xml\/davinci$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.mode) return sendError(res, 'mode required (single, approved, final)');
      if (body.mode === 'single' && !body.cutId) return sendError(res, 'cutId required for single mode');
      const result = exportDaVinciXml(id, body.mode, body.cutId);
      return sendJSON(res, { filename: result.filename, clipCount: result.clipCount, totalDuration: result.totalDuration, editor: 'davinci', mode: body.mode });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/export\/package$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.mode) return sendError(res, 'mode required (single, approved, final)');
      if (!body.editor) return sendError(res, 'editor required (premiere, davinci)');
      if (body.mode === 'single' && !body.cutId) return sendError(res, 'cutId required for single mode');
      const result = buildExportPackage(id, body.mode, body.editor, body.cutId);
      return sendJSON(res, { filename: result.filename, size: result.size, sizeFormatted: result.sizeFormatted, entries: result.entries, clipCount: result.clipCount, totalDuration: result.totalDuration });
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/export\/history$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      return sendJSON(res, getExportHistory(id));
    }

    // Serve exported files for download
    if (pathname.match(/^\/api\/projects\/[^/]+\/export\/download\/[^/]+$/) && method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const filename = decodeURIComponent(parts[6]);
      const filePath = path.join(getProjectDir(id), 'exports', filename);
      if (!fs.existsSync(filePath)) return sendError(res, 'Export file not found', 404);
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = { '.xml': 'application/xml', '.zip': 'application/zip', '.json': 'application/json' };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
      });
      return fs.createReadStream(filePath).pipe(res);
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

    // ── Live Pipeline ─────────────────────────────────
    if (pathname === '/api/pipeline/start' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.source) return sendError(res, 'source required');
      console.log(`[${new Date().toISOString()}] [PIPELINE] Start requested — source: ${body.source}`);
      // Start pipeline async, send projectId immediately
      const promise = runLivePipeline(body.source, { name: body.name, srt: body.srt });
      promise.catch((err) => {
        console.error(`[${new Date().toISOString()}] [PIPELINE] Failed — source: ${body.source}, error: ${err.message}`);
      });
      console.log(`[${new Date().toISOString()}] [PIPELINE] Job started — source: ${body.source}`);
      return sendJSON(res, { status: 'started', message: 'Pipeline iniciado. Conecte ao SSE para acompanhar.' }, 202);
    }

    // SSE endpoint for live updates
    if (pathname.match(/^\/api\/pipeline\/[^/]+\/events$/) && method === 'GET') {
      const projectId = pathname.split('/')[3];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ projectId })}\n\n`);
      console.log(`[${new Date().toISOString()}] [SSE] Connection opened — projectId: ${projectId}`);

      // Send existing state if any
      const state = getPipelineState(projectId);
      if (state && state.events) {
        for (const evt of state.events) {
          res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        }
      }

      // Heartbeat every 15s to keep Cloudflare tunnel alive
      let heartbeatCount = 0;
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
          heartbeatCount++;
          if (heartbeatCount % 4 === 0) {
            const clientCount = (require('./live-pipeline').clients.get(projectId) || []).length;
            console.log(`[${new Date().toISOString()}] [SSE] Heartbeat #${heartbeatCount} — projectId: ${projectId}, clients: ${clientCount}`);
          }
        } catch { clearInterval(heartbeat); }
      }, 15000);

      addClient(projectId, res);
      req.on('close', () => {
        clearInterval(heartbeat);
        removeClient(projectId, res);
        const remainingClients = (require('./live-pipeline').clients.get(projectId) || []).length;
        console.log(`[${new Date().toISOString()}] [SSE] Connection closed — projectId: ${projectId}, heartbeats: ${heartbeatCount}, remaining clients: ${remainingClients}`);
      });
      return; // keep connection open
    }

    if (pathname.match(/^\/api\/pipeline\/[^/]+\/state$/) && method === 'GET') {
      const requestedId = pathname.split('/')[3];
      let state = getPipelineState(requestedId);
      // If 'pending' has no state, find the most recent active pipeline
      if ((!state || !state.events || state.events.length === 0) && requestedId === 'pending') {
        const livePipeline = require('./live-pipeline');
        if (livePipeline.pipelineStates) {
          for (const [pid, pState] of livePipeline.pipelineStates) {
            if (pid !== 'pending' && pState.events && pState.events.length > 0) {
              state = pState;
              break;
            }
          }
        }
      }
      return sendJSON(res, state || { events: [] });
    }

    // Serve Escala Mix UI page
    if (pathname === '/escala-mix' || pathname === '/escala-mix/') {
      const mixHtml = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-escala-mix.html');
      if (!fs.existsSync(mixHtml)) return sendError(res, 'Escala Mix page not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(mixHtml).pipe(res);
    }

    // Serve projects library page
    if (pathname === '/av/projects' || pathname === '/av/projects/') {
      const projectsHtml = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-projects.html');
      if (!fs.existsSync(projectsHtml)) return sendError(res, 'Projects page not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(projectsHtml).pipe(res);
    }

    // Serve live pipeline HTML page
    if (pathname === '/av' || pathname === '/av/') {
      const htmlPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-live-pipeline.html');
      if (!fs.existsSync(htmlPath)) return sendError(res, 'Live pipeline page not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(htmlPath).pipe(res);
    }

    // Serve workspace page for a specific project
    if (pathname.match(/^\/av\/[^/]+\/workspace$/) && method === 'GET') {
      const projectId = pathname.split('/')[2];
      const wsHtml = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-workspace.html');
      if (!fs.existsSync(wsHtml)) return sendError(res, 'Workspace page not found', 404);
      let html = fs.readFileSync(wsHtml, 'utf8');
      html = html.replace('__PROJECT_ID__', projectId);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return res.end(html);
    }

    // Serve approval page for a specific project
    if (pathname.match(/^\/av\/[^/]+\/approve$/) && method === 'GET') {
      const projectId = pathname.split('/')[2];
      const approvalHtml = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-approve.html');
      if (!fs.existsSync(approvalHtml)) return sendError(res, 'Approval page not found', 404);
      let html = fs.readFileSync(approvalHtml, 'utf8');
      html = html.replace('__PROJECT_ID__', projectId);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return res.end(html);
    }

    // ── Serve video file for preview ─────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/video$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const sourceDir = path.join(getProjectDir(id), 'source');
      if (!fs.existsSync(sourceDir)) return sendError(res, 'Not found', 404);
      const files = fs.readdirSync(sourceDir);
      const videoFile = files.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
      if (!videoFile) return sendError(res, 'No video', 404);
      const videoPath = path.join(sourceDir, videoFile);
      const stat = fs.statSync(videoPath);
      const ext = path.extname(videoFile).toLowerCase();
      const mimeTypes = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
      const mime = mimeTypes[ext] || 'video/mp4';
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
        return fs.createReadStream(videoPath, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(videoPath).pipe(res);
    }

    // ── Cut preview video ──────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/preview\/[^/]+\.mp4$/) && method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const filename = parts[5];
      const pp = path.join(getProjectDir(id), 'cuts', 'previews', filename);
      if (!fs.existsSync(pp)) return sendError(res, 'Not found', 404);
      const stat = fs.statSync(pp);
      const noCacheHeaders = { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' };
      const range = req.headers.range;
      if (range) {
        const rp = range.replace(/bytes=/, '').split('-');
        const s = parseInt(rp[0], 10);
        const e = rp[1] ? parseInt(rp[1], 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*', ...noCacheHeaders });
        return fs.createReadStream(pp, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', ...noCacheHeaders });
      return fs.createReadStream(pp).pipe(res);
    }

    // ── Cut Previews (AV-10) ─────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/previews$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = generateCutPreviews(id);
      return sendJSON(res, result);
    }

    // ── Energy Detection (AV-10) ─────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/energy$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const result = detectEnergy(id);
      return sendJSON(res, result);
    }

    if (pathname.match(/^\/api\/projects\/[^/]+\/energy$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const data = loadEnergyData(id);
      if (!data) return sendJSON(res, { error: 'No energy data. Run POST /energy first.' }, 404);
      return sendJSON(res, data);
    }

    // ── Hook video (AV-10) ─────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/hook$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const hookPath = path.join(getProjectDir(id), 'production', 'hook.mp4');
      if (!fs.existsSync(hookPath)) return sendError(res, 'Hook not found. Run POST /energy first.', 404);
      const stat = fs.statSync(hookPath);
      const range = req.headers.range;
      if (range) {
        const rp = range.replace(/bytes=/, '').split('-');
        const s = parseInt(rp[0], 10);
        const e = rp[1] ? parseInt(rp[1], 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' });
        return fs.createReadStream(hookPath, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(hookPath).pipe(res);
    }

    // ── Transcription ─────────────────────────────────
    if (pathname.match(/^\/api\/projects\/[^/]+\/transcription$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const tp = path.join(getProjectDir(id), 'analysis', 'transcription.json');
      if (!fs.existsSync(tp)) return sendJSON(res, { segments: [] });
      return sendJSON(res, JSON.parse(fs.readFileSync(tp, 'utf8')));
    }

    // ── File Upload (local video from browser) ──────
    if (pathname === '/api/upload' && method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart') && !contentType.includes('octet-stream')) {
        return sendError(res, 'Expected file upload (multipart or octet-stream)');
      }
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      const ext = path.extname((url.parse(req.url, true).query.filename || '')).toLowerCase() || '.mp4';
      console.log(`[${new Date().toISOString()}] [UPLOAD] Single upload started — size: ${(contentLength / 1048576).toFixed(1)}MB, ext: ${ext}`);
      if (contentLength > 2 * 1024 * 1024 * 1024) {
        console.error(`[${new Date().toISOString()}] [UPLOAD] Rejected — file too large: ${(contentLength / 1048576).toFixed(0)}MB`);
        return sendError(res, 'Arquivo muito grande. Limite: 2GB.', 413);
      }

      // Save raw body as temp file
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads');
      fs.mkdirSync(tmpDir, { recursive: true });

      // Extract filename from Content-Disposition or query
      const parsed2 = url.parse(req.url, true);
      const filename = (parsed2.query.filename || `upload-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const tmpPath = path.join(tmpDir, filename);
      console.log(`[${new Date().toISOString()}] [UPLOAD] Saving to: ${tmpPath}, filename: ${filename}`);
      const ws = fs.createWriteStream(tmpPath);

      req.pipe(ws);
      ws.on('finish', () => {
        console.log(`[${new Date().toISOString()}] [UPLOAD] Success — saved: ${tmpPath}`);
        sendJSON(res, { uploaded: true, path: tmpPath, filename }, 201);
      });
      ws.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [UPLOAD] Failed — ${err.message}`);
        sendError(res, `Upload failed: ${err.message}`, 500);
      });
      return;
    }

    // ── Chunked Upload (bypass Cloudflare 100MB limit) ──────
    const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

    if (pathname === '/api/upload/init' && method === 'POST') {
      const body = await parseBody(req);
      console.log(`[${new Date().toISOString()}] [UPLOAD] Chunked init — filename: ${body.filename || 'unknown'}, totalSize: ${((body.totalSize || 0) / 1048576).toFixed(1)}MB, totalChunks: ${body.totalChunks || 0}`);
      if (body.totalSize && body.totalSize > MAX_UPLOAD_SIZE) {
        console.error(`[${new Date().toISOString()}] [UPLOAD] Chunked init rejected — too large: ${(body.totalSize / 1048576).toFixed(0)}MB`);
        return sendError(res, `Arquivo muito grande (${(body.totalSize / 1048576).toFixed(0)}MB). Limite: 2GB.`, 413);
      }
      const uploadId = require('crypto').randomUUID();
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads', uploadId);
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = (body.filename || `upload-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify({
        filename, totalSize: body.totalSize || 0, totalChunks: body.totalChunks || 0, received: 0,
      }));
      console.log(`[${new Date().toISOString()}] [UPLOAD] Chunked session created — uploadId: ${uploadId}, filename: ${filename}`);
      return sendJSON(res, { uploadId, filename }, 201);
    }

    if (pathname === '/api/upload/chunk' && method === 'POST') {
      const parsed2 = url.parse(req.url, true);
      const uploadId = parsed2.query.uploadId;
      const chunkIndex = parseInt(parsed2.query.chunk || '0', 10);
      if (!uploadId) return sendError(res, 'uploadId required');
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads', uploadId);
      if (!fs.existsSync(tmpDir)) return sendError(res, 'Upload session not found', 404);
      const chunkPath = path.join(tmpDir, `chunk-${String(chunkIndex).padStart(5, '0')}`);
      const ws = fs.createWriteStream(chunkPath);
      req.pipe(ws);
      ws.on('finish', () => {
        const meta = JSON.parse(fs.readFileSync(path.join(tmpDir, 'meta.json'), 'utf8'));
        meta.received = (meta.received || 0) + 1;
        fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify(meta));
        console.log(`[${new Date().toISOString()}] [UPLOAD] Chunk ${chunkIndex + 1}/${meta.totalChunks || '?'} received — uploadId: ${uploadId}`);
        sendJSON(res, { ok: true, chunk: chunkIndex, received: meta.received });
      });
      ws.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [UPLOAD] Chunk ${chunkIndex} failed — uploadId: ${uploadId}, error: ${err.message}`);
        sendError(res, `Chunk upload failed: ${err.message}`, 500);
      });
      return;
    }

    if (pathname === '/api/upload/complete' && method === 'POST') {
      const body = await parseBody(req);
      const uploadId = body.uploadId;
      if (!uploadId) return sendError(res, 'uploadId required');
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads', uploadId);
      if (!fs.existsSync(tmpDir)) return sendError(res, 'Upload session not found', 404);
      const meta = JSON.parse(fs.readFileSync(path.join(tmpDir, 'meta.json'), 'utf8'));
      console.log(`[${new Date().toISOString()}] [UPLOAD] Assembling ${meta.received || '?'} chunks — uploadId: ${uploadId}, filename: ${meta.filename}`);
      // Assemble chunks into final file
      const outputDir = path.join(require('os').tmpdir(), 'aiox-av-uploads');
      const finalPath = path.join(outputDir, meta.filename);
      const ws = fs.createWriteStream(finalPath);
      const chunks = fs.readdirSync(tmpDir).filter(f => f.startsWith('chunk-')).sort();
      for (const chunk of chunks) {
        const data = fs.readFileSync(path.join(tmpDir, chunk));
        ws.write(data);
      }
      ws.end();
      ws.on('finish', () => {
        // Cleanup chunks
        fs.rmSync(tmpDir, { recursive: true, force: true });
        const finalSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : 0;
        console.log(`[${new Date().toISOString()}] [UPLOAD] Complete — filename: ${meta.filename}, finalSize: ${(finalSize / 1048576).toFixed(1)}MB, path: ${finalPath}`);
        sendJSON(res, { uploaded: true, path: finalPath, filename: meta.filename }, 201);
      });
      ws.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [UPLOAD] Assembly failed — uploadId: ${uploadId}, error: ${err.message}`);
        sendError(res, `Assembly failed: ${err.message}`, 500);
      });
      return;
    }

    // ── Editor Growth: Edit CRUD + Export (EG-3) ────
    if (pathname === '/api/edit/presets' && method === 'GET') {
      return sendJSON(res, { presets: subtitlePresets.listPresets() });
    }

    if (pathname.match(/^\/api\/edit\/presets\/[^/]+$/) && method === 'GET') {
      const expert = pathname.split('/')[4];
      return sendJSON(res, { presets: subtitlePresets.listPresetsByExpert(expert) });
    }

    if (pathname === '/api/edit/list' && method === 'GET') {
      return sendJSON(res, { edits: editStore.listEdits() });
    }

    if (pathname === '/api/edit/create' && method === 'POST') {
      const contentType = req.headers['content-type'] || '';

      // Multipart upload for standalone mode
      if (contentType.includes('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) return sendError(res, 'Missing multipart boundary', 400);

        const chunks = [];
        await new Promise((resolve, reject) => {
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', resolve);
          req.on('error', reject);
        });
        const buffer = Buffer.concat(chunks);
        const bodyStr = buffer.toString('binary');
        const parts = bodyStr.split('--' + boundary);

        let fileBuffer = null;
        let originalFilename = 'upload.mp4';

        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headers = part.substring(0, headerEnd);
          const content = part.substring(headerEnd + 4);

          if (headers.includes('name="video"')) {
            const fnMatch = headers.match(/filename="([^"]+)"/);
            if (fnMatch) originalFilename = fnMatch[1];
            // Remove trailing \r\n-- from content
            const cleaned = content.replace(/\r\n--$/, '').replace(/\r\n$/, '');
            fileBuffer = Buffer.from(cleaned, 'binary');
          }
        }

        if (!fileBuffer) return sendError(res, 'Missing "video" field in multipart body', 400);

        const { AV_DIR } = require('./constants');
        const uploadsDir = path.join(AV_DIR, 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadPath = path.join(uploadsDir, `${Date.now()}-${safeName}`);
        fs.writeFileSync(uploadPath, fileBuffer);

        const edit = editStore.createEdit(uploadPath, 'standalone');

        // Auto-transcribe in background
        (async () => {
          try {
            const { transcribeFile } = require('./transcribe');
            const transcription = await transcribeFile(uploadPath);
            const transcript = (transcription.segments || []).map(seg => ({
              t: seg.start,
              text: seg.text,
              edited: false,
            }));
            editStore.updateEdit(edit.editId, { transcript });
            console.log(`[EDIT] Transcription complete for ${edit.editId}: ${transcript.length} segments`);
          } catch (err) {
            console.log(`[EDIT] Auto-transcribe failed for ${edit.editId}: ${err.message}`);
          }
        })();

        return sendJSON(res, { editId: edit.editId, status: 'transcribing', mode: 'standalone' }, 201);
      }

      // JSON body mode
      const body = await parseBody(req);
      if (!body.source) return sendError(res, 'source is required', 400);

      const source = body.source;
      const isVideoPath = path.isAbsolute(source) || /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(source);
      const isStandalone = isVideoPath && !body.projectId;

      if (isStandalone) {
        const resolvedPath = path.isAbsolute(source) ? source : path.resolve(source);
        if (!fs.existsSync(resolvedPath)) return sendError(res, `Video file not found: ${source}`, 404);

        const edit = editStore.createEdit(resolvedPath, 'standalone');

        // Auto-transcribe in background
        (async () => {
          try {
            const { transcribeFile } = require('./transcribe');
            const transcription = await transcribeFile(resolvedPath);
            const transcript = (transcription.segments || []).map(seg => ({
              t: seg.start,
              text: seg.text,
              edited: false,
            }));
            editStore.updateEdit(edit.editId, { transcript });
            console.log(`[EDIT] Transcription complete for ${edit.editId}: ${transcript.length} segments`);
          } catch (err) {
            console.log(`[EDIT] Auto-transcribe failed for ${edit.editId}: ${err.message}`);
          }
        })();

        return sendJSON(res, { editId: edit.editId, status: 'transcribing', mode: 'standalone' }, 201);
      }

      // Cut-based mode
      try {
        const { projectId: resolvedProjectId } = editStore.resolveCutId(source);
        const pid = body.projectId || resolvedProjectId;
        const edit = editStore.createEdit(source, pid);
        return sendJSON(res, { editId: edit.editId, status: 'draft', mode: 'cut' }, 201);
      } catch (err) {
        return sendError(res, err.message, 400);
      }
    }

    // GET /api/edit/:editId
    if (pathname.match(/^\/api\/edit\/[^/]+$/) && !pathname.includes('/presets') && method === 'GET') {
      const editId = pathname.split('/')[3];
      try {
        const edit = editStore.getEdit(editId);
        return sendJSON(res, { edit });
      } catch (err) {
        return sendError(res, err.message, 404);
      }
    }

    // GET /api/edit/:editId/source — stream source video with Range support
    if (pathname.match(/^\/api\/edit\/[^/]+\/source$/) && method === 'GET') {
      const editId = pathname.split('/')[3];
      try {
        const edit = editStore.getEdit(editId);
        const sourcePath = edit.sourceVideo;
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          return sendError(res, 'Source video not found on disk', 404);
        }
        const stat = fs.statSync(sourcePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        const ext = path.extname(sourcePath).toLowerCase();
        const mime = ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
          });
          fs.createReadStream(sourcePath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': mime,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          });
          fs.createReadStream(sourcePath).pipe(res);
        }
        return;
      } catch (err) {
        return sendError(res, err.message, 404);
      }
    }

    // PUT /api/edit/:editId/trim
    if (pathname.match(/^\/api\/edit\/[^/]+\/trim$/) && method === 'PUT') {
      const editId = pathname.split('/')[3];
      const body = await parseBody(req);
      if (body.in === undefined || body.out === undefined) {
        return sendError(res, 'in and out are required', 400);
      }
      try {
        const edit = editStore.updateEdit(editId, { trim: { in: body.in, out: body.out } });
        return sendJSON(res, { edit });
      } catch (err) {
        return sendError(res, err.message, err.message.includes('not found') ? 404 : 400);
      }
    }

    // PUT /api/edit/:editId/transcript
    if (pathname.match(/^\/api\/edit\/[^/]+\/transcript$/) && method === 'PUT') {
      const editId = pathname.split('/')[3];
      const body = await parseBody(req);
      if (body.index === undefined || body.text === undefined) {
        return sendError(res, 'index and text are required', 400);
      }
      try {
        const edit = editStore.getEdit(editId);
        const transcript = [...(edit.transcript || [])];
        if (body.index < 0 || body.index >= transcript.length) {
          return sendError(res, `index ${body.index} out of range (0-${transcript.length - 1})`, 400);
        }
        transcript[body.index] = { ...transcript[body.index], text: body.text, edited: true };
        const updated = editStore.updateEdit(editId, { transcript });
        return sendJSON(res, { edit: updated });
      } catch (err) {
        return sendError(res, err.message, err.message.includes('not found') ? 404 : 400);
      }
    }

    // PUT /api/edit/:editId/preset
    if (pathname.match(/^\/api\/edit\/[^/]+\/preset$/) && method === 'PUT') {
      const editId = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body.presetId) return sendError(res, 'presetId is required', 400);
      try {
        subtitlePresets.getPreset(body.presetId); // validate preset exists
      } catch (err) {
        return sendError(res, err.message, 400);
      }
      try {
        const edit = editStore.updateEdit(editId, { presetId: body.presetId });
        return sendJSON(res, { edit });
      } catch (err) {
        return sendError(res, err.message, 404);
      }
    }

    // PUT /api/edit/:editId/style-overrides
    if (pathname.match(/^\/api\/edit\/[^/]+\/style-overrides$/) && method === 'PUT') {
      const editId = pathname.split('/')[3];
      const body = await parseBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return sendError(res, 'Body must be an object of style overrides', 400);
      }
      try {
        const edit = editStore.updateEdit(editId, { styleOverrides: body });
        return sendJSON(res, { edit });
      } catch (err) {
        return sendError(res, err.message, err.message.includes('not found') ? 404 : 400);
      }
    }

    // POST /api/edit/:editId/export — SSE progress stream
    if (pathname.match(/^\/api\/edit\/[^/]+\/export$/) && method === 'POST') {
      const editId = pathname.split('/')[3];

      // Validate edit exists first
      try {
        editStore.getEdit(editId);
      } catch (err) {
        return sendError(res, err.message, 404);
      }

      const bodyRaw = await parseBody(req);
      const quality = bodyRaw.quality || 'high';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      try {
        const result = exportEdit(editId, {
          quality,
          onProgress: (stage, progress) => {
            const evt = { stage, progress, message: `${stage}: ${progress}%` };
            res.write(`data: ${JSON.stringify(evt)}\n\n`);
          },
        });

        const doneEvt = { stage: 'done', progress: 100, outputPath: result.outputPath };
        res.write(`data: ${JSON.stringify(doneEvt)}\n\n`);
      } catch (err) {
        const errEvt = { stage: 'error', progress: 0, message: err.message };
        res.write(`data: ${JSON.stringify(errEvt)}\n\n`);
      }
      return res.end();
    }

    // GET /api/edit/:editId/export/download
    if (pathname.match(/^\/api\/edit\/[^/]+\/export\/download$/) && method === 'GET') {
      const editId = pathname.split('/')[3];
      const exportPath = path.join(EDIT_EXPORTS_DIR, `${editId}.mp4`);
      if (!fs.existsSync(exportPath)) return sendError(res, 'Export not found. Run POST /api/edit/:editId/export first.', 404);
      const stat = fs.statSync(exportPath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="edit-${editId}.mp4"`,
        'Access-Control-Allow-Origin': '*',
      });
      return fs.createReadStream(exportPath).pipe(res);
    }

    // DELETE /api/edit/:editId
    if (pathname.match(/^\/api\/edit\/[^/]+$/) && !pathname.includes('/presets') && method === 'DELETE') {
      const editId = pathname.split('/')[3];
      try {
        editStore.deleteEdit(editId);
        return sendJSON(res, { deleted: true, editId });
      } catch (err) {
        return sendError(res, err.message, 404);
      }
    }

    // ── Escala Mix (Hook × Dev × CTA) ──────────────────
    if (pathname === '/api/escala-mix' && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      return sendJSON(res, { mixes: mixStore.listMixes() });
    }
    if (pathname === '/api/escala-mix' && method === 'POST') {
      const mixStore = require('./escala-mix-store');
      const body = await parseBody(req);
      return sendJSON(res, { mix: mixStore.createMix(body.name || null) }, 201);
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+$/) && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      const mixId = pathname.split('/')[3];
      try { return sendJSON(res, { mix: mixStore.readPool(mixId) }); }
      catch (err) { return sendError(res, err.message, 404); }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+$/) && method === 'DELETE') {
      const mixStore = require('./escala-mix-store');
      const mixId = pathname.split('/')[3];
      try { return sendJSON(res, mixStore.deleteMix(mixId)); }
      catch (err) { return sendError(res, err.message, 404); }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/assets$/) && method === 'POST') {
      const mixStore = require('./escala-mix-store');
      const mixId = pathname.split('/')[3];
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('multipart/form-data')) return sendError(res, 'Expected multipart upload', 400);
      const boundary = ct.split('boundary=')[1];
      if (!boundary) return sendError(res, 'Missing multipart boundary', 400);
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', c => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      const buffer = Buffer.concat(chunks);
      const bodyStr = buffer.toString('binary');
      const parts = bodyStr.split('--' + boundary);
      let fileBuffer = null;
      let originalFilename = 'upload.mp4';
      let kind = null;
      let customName = null;
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers = part.substring(0, headerEnd);
        const content = part.substring(headerEnd + 4);
        const cleaned = content.replace(/\r\n--$/, '').replace(/\r\n$/, '');
        if (headers.includes('name="video"')) {
          const fn = headers.match(/filename="([^"]+)"/);
          if (fn) originalFilename = fn[1];
          fileBuffer = Buffer.from(cleaned, 'binary');
        } else if (headers.includes('name="kind"')) {
          kind = cleaned;
        } else if (headers.includes('name="name"')) {
          customName = cleaned;
        }
      }
      if (!fileBuffer || !kind) return sendError(res, 'Missing video or kind field', 400);
      const kindMap = { hook: 'hooks', dev: 'devs', cta: 'ctas', hooks: 'hooks', devs: 'devs', ctas: 'ctas' };
      const normalizedKind = kindMap[kind.toLowerCase()];
      if (!normalizedKind) return sendError(res, `Invalid kind "${kind}"`, 400);
      const os = require('os');
      const tmpPath = path.join(os.tmpdir(), `escala-mix-${Date.now()}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      fs.writeFileSync(tmpPath, fileBuffer);
      try {
        const asset = await mixStore.addAsset(mixId, normalizedKind, tmpPath, customName || path.parse(originalFilename).name);
        fs.unlinkSync(tmpPath);
        return sendJSON(res, { asset, kind: normalizedKind }, 201);
      } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        return sendError(res, err.message, 400);
      }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/thumbs\/[^/]+$/) && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      const parts = pathname.split('/');
      const mixId = parts[3];
      const assetId = parts[5].replace(/\.[^.]+$/, '');
      const thumbPath = path.join(mixStore.getMixDir(mixId), 'thumbs', `${assetId}.jpg`);
      if (!fs.existsSync(thumbPath)) return sendError(res, 'Thumb not found', 404);
      const stat = fs.statSync(thumbPath);
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
      });
      return fs.createReadStream(thumbPath).pipe(res);
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/assets\/[^/]+$/) && method === 'DELETE') {
      const mixStore = require('./escala-mix-store');
      const parts = pathname.split('/');
      const mixId = parts[3];
      const assetId = parts[5];
      const prefix = assetId.slice(0, 2);
      const kind = prefix === 'h_' ? 'hooks' : prefix === 'd_' ? 'devs' : prefix === 'c_' ? 'ctas' : null;
      if (!kind) return sendError(res, 'Cannot infer kind from assetId', 400);
      try { return sendJSON(res, mixStore.removeAsset(mixId, kind, assetId)); }
      catch (err) { return sendError(res, err.message, 404); }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/plan$/) && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      const mixId = pathname.split('/')[3];
      const limit = parsed.query.limit ? parseInt(parsed.query.limit, 10) : null;
      try { return sendJSON(res, { renders: mixStore.planRenders(mixId, limit) }); }
      catch (err) { return sendError(res, err.message, 400); }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/generate$/) && method === 'POST') {
      const mixId = pathname.split('/')[3];
      const body = await parseBody(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const { renderAll } = require('./escala-mix-render');
      const opts = {
        width: body.width || 1080,
        height: body.height || 1920,
        preset: body.preset || 'medium',
      };
      const send = (evt, data) => res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);
      renderAll(mixId, {
        limit: body.limit || null,
        opts,
        onProgress: e => send('progress', e),
      }).then(results => {
        send('done', { results });
        res.end();
      }).catch(err => {
        send('error', { message: err.message });
        res.end();
      });
      return;
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/renders\/[^/]+\/rating$/) && method === 'PUT') {
      const mixStore = require('./escala-mix-store');
      const parts = pathname.split('/');
      const mixId = parts[3];
      const renderId = parts[5];
      const body = await parseBody(req);
      try {
        const r = mixStore.setRenderRating(mixId, renderId, Number(body.rating));
        return sendJSON(res, { render: r, ranking: mixStore.getRanking(mixId) });
      } catch (err) {
        return sendError(res, err.message, 400);
      }
    }
    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/ai-suggest$/) && method === 'POST') {
      const { generateSuggestions, suggestFromTop } = require('./ai-hook-generator');
      const mixId = pathname.split('/')[3];
      const body = await parseBody(req);
      try {
        const type = body.type === 'cta' ? 'cta' : 'hook';
        const count = Math.min(Math.max(parseInt(body.count, 10) || 5, 1), 10);
        let items;
        if (body.fromTop) {
          items = await suggestFromTop({ mixId, kind: type, count });
        } else {
          if (!body.theme) return sendError(res, 'theme is required (or set fromTop:true)', 400);
          items = await generateSuggestions({ type, theme: body.theme, count });
        }
        return sendJSON(res, { items, type, count: items.length });
      } catch (err) {
        return sendError(res, err.message, 500);
      }
    }

    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/ranking$/) && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      const mixId = pathname.split('/')[3];
      try { return sendJSON(res, { ranking: mixStore.getRanking(mixId) }); }
      catch (err) { return sendError(res, err.message, 404); }
    }

    if (pathname.match(/^\/api\/escala-mix\/[^/]+\/renders\/[^/]+\/download$/) && method === 'GET') {
      const mixStore = require('./escala-mix-store');
      const parts = pathname.split('/');
      const mixId = parts[3];
      const renderId = parts[5];
      try {
        const pool = mixStore.readPool(mixId);
        const r = pool.renders.find(x => x.id === renderId);
        if (!r || !r.output || !fs.existsSync(r.output)) return sendError(res, 'Render output not found', 404);
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${path.basename(r.output)}"`,
          'Content-Length': fs.statSync(r.output).size,
        });
        fs.createReadStream(r.output).pipe(res);
        return;
      } catch (err) { return sendError(res, err.message, 404); }
    }

    // ── Security Status ─────────────────────────────
    if (pathname === '/api/security' && method === 'GET') {
      return sendJSON(res, getSecurityStatus());
    }

    // ── Health ────────────────────────────────────────
    if (pathname === '/api/health') {
      return sendJSON(res, { status: 'ok', service: 'central-audiovisual', timestamp: new Date().toISOString() });
    }

    // ── Radar Editorial API ───────────────────────────
    if (pathname === '/api/radar/status' && method === 'GET') {
      try {
        const { getAgentStatus } = require('../../../packages/radar-editorial/lib/radar-agent');
        return sendJSON(res, getAgentStatus());
      } catch (err) { return sendJSON(res, { status: 'offline', error: err.message }); }
    }

    if (pathname === '/api/radar/run' && method === 'POST') {
      try {
        const { runRadar } = require('../../../packages/radar-editorial/lib/radar-agent');
        const result = await runRadar({ silent: true });
        return sendJSON(res, { ok: true, summary: result.report.summary, alerts: result.report.alerts.length });
      } catch (err) { return sendError(res, err.message, 500); }
    }

    if (pathname === '/api/radar/config' && method === 'GET') {
      try {
        const { loadConfig } = require('../../../packages/radar-editorial/lib/config');
        const config = loadConfig();
        config.notionToken = config.notionToken ? '***' + config.notionToken.slice(-6) : '';
        config.telegram.botToken = config.telegram.botToken ? '***' + config.telegram.botToken.slice(-6) : '';
        return sendJSON(res, config);
      } catch (err) { return sendJSON(res, { error: err.message }); }
    }

    if (pathname === '/api/radar/history' && method === 'GET') {
      try {
        const { loadHistory } = require('../../../packages/radar-editorial/lib/config');
        return sendJSON(res, loadHistory(10));
      } catch (err) { return sendJSON(res, []); }
    }

    // ── Serve Dashboard (Centro de Comando) ──────────
    if (pathname === '/' || pathname === '/index.html') {
      const dashPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'index.html');
      if (!fs.existsSync(dashPath)) return sendError(res, 'Dashboard not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(dashPath).pipe(res);
    }

    // ── Serve static files from ux-command-center ────
    const uxDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center');
    const safePath = path.join(uxDir, pathname.replace(/^\//, ''));
    if (safePath.startsWith(uxDir) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      const mimeMap = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      return fs.createReadStream(safePath).pipe(res);
    }

    // 404
    sendError(res, `Not found: ${method} ${pathname}`, 404);

  } catch (err) {
    sendError(res, err.message, 500);
  }
}

function createServer(port = DEFAULT_PORT) {
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('  ================================================================');
    console.log('  CENTRAL AUDIOVISUAL — API Server');
    console.log(`  http://localhost:${port}`);
    console.log(`  ${new Date().toLocaleString('pt-BR')}`);
    console.log('  ================================================================');
    console.log('');

    // Auto-cleanup projects older than N days
    const { removed, kept } = cleanupOldProjects();
    if (removed.length > 0) {
      console.log(`  Cleanup: removed ${removed.length} projects older than ${PROJECT_MAX_AGE_DAYS} days (${kept} kept)`);
    }

    // Start security alerts (Telegram notifications)
    startSecurityAlerts();

    // Start security bot (Telegram commands)
    startSecurityBot();
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
    console.log('    POST /api/projects/:id/previews');
    console.log('    POST /api/projects/:id/energy');
    console.log('    GET  /api/projects/:id/energy');
    console.log('    GET  /api/projects/:id/hook');
    console.log('    POST /api/projects/:id/export/xml/premiere { mode, cutId? }');
    console.log('    POST /api/projects/:id/export/xml/davinci  { mode, cutId? }');
    console.log('    POST /api/projects/:id/export/package      { mode, editor, cutId? }');
    console.log('    GET  /api/projects/:id/export/history');
    console.log('    GET  /api/projects/:id/export/download/:f');
    console.log('    GET  /api/brands');
    console.log('    POST /api/brands                        { name, logo?, ... }');
    console.log('    GET  /api/brands/:slug');
    console.log('    PUT  /api/brands/:slug                  { updates }');
    console.log('    DELETE /api/brands/:slug');
    console.log('    --- Editor Growth (EG-3) ---');
    console.log('    POST /api/edit/create                   { source, projectId? }');
    console.log('    GET  /api/edit/list');
    console.log('    GET  /api/edit/:editId');
    console.log('    PUT  /api/edit/:editId/trim             { in, out }');
    console.log('    PUT  /api/edit/:editId/transcript       { index, text }');
    console.log('    PUT  /api/edit/:editId/preset           { presetId }');
    console.log('    POST /api/edit/:editId/export           { quality? } → SSE');
    console.log('    GET  /api/edit/:editId/export/download');
    console.log('    DELETE /api/edit/:editId');
    console.log('    GET  /api/edit/presets');
    console.log('    GET  /api/edit/presets/:expert');
    console.log('');
  });
  return server;
}

module.exports = { createServer, handleRequest, DEFAULT_PORT };
