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
const { listProjects, loadProject, getProjectDir } = require('./project');
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

const DEFAULT_PORT = 3456;

// Rate limiting — 30 requests per minute per IP (zero deps)
const RATE_LIMIT = 200;
const RATE_WINDOW = 60000; // 1 minute
const rateLimitMap = new Map();

function checkRateLimit(req, res) {
  const ip = req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip).filter(t => now - t < RATE_WINDOW);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (timestamps.length > RATE_LIMIT) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'Too many requests. Limit: 30/min.' }));
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

function checkAuth(req, res) {
  const pathname = url.parse(req.url).pathname;

  // Auth ONLY on the main entry points (/ and /index.html)
  // Everything else (APIs, static files, iframes) is open once you're past the gate.
  // Cloudflare tunnel + iframes don't reliably pass cookies, so we gate at the door only.
  if (pathname !== '/' && pathname !== '/index.html') return true;

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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Auth check — show login page if not authenticated
  if (!checkAuth(req, res)) {
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

  // Rate limit check (skip for SSE and static files)
  const isSSE = req.url.includes('/events');
  const isStatic = !req.url.startsWith('/api/');
  if (!isSSE && !isStatic && !checkRateLimit(req, res)) {
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
      // Start pipeline async, send projectId immediately
      const promise = runLivePipeline(body.source, { name: body.name, srt: body.srt });
      promise.catch(() => {}); // errors handled via SSE
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

      // Send existing state if any
      const state = getPipelineState(projectId);
      if (state && state.events) {
        for (const evt of state.events) {
          res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        }
      }

      // Heartbeat every 15s to keep Cloudflare tunnel alive
      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
      }, 15000);

      addClient(projectId, res);
      req.on('close', () => { clearInterval(heartbeat); removeClient(projectId, res); });
      return; // keep connection open
    }

    if (pathname.match(/^\/api\/pipeline\/[^/]+\/state$/) && method === 'GET') {
      const projectId = pathname.split('/')[3];
      const state = getPipelineState(projectId);
      return sendJSON(res, state || { events: [] });
    }

    // Serve live pipeline HTML page
    if (pathname === '/av' || pathname === '/av/') {
      const htmlPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-live-pipeline.html');
      if (!fs.existsSync(htmlPath)) return sendError(res, 'Live pipeline page not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(htmlPath).pipe(res);
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
      if (contentLength > 2 * 1024 * 1024 * 1024) {
        return sendError(res, 'Arquivo muito grande. Limite: 2GB.', 413);
      }

      // Save raw body as temp file
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads');
      fs.mkdirSync(tmpDir, { recursive: true });

      // Extract filename from Content-Disposition or query
      const parsed2 = url.parse(req.url, true);
      const filename = (parsed2.query.filename || `upload-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const tmpPath = path.join(tmpDir, filename);
      const ws = fs.createWriteStream(tmpPath);

      req.pipe(ws);
      ws.on('finish', () => {
        sendJSON(res, { uploaded: true, path: tmpPath, filename }, 201);
      });
      ws.on('error', (err) => {
        sendError(res, `Upload failed: ${err.message}`, 500);
      });
      return;
    }

    // ── Chunked Upload (bypass Cloudflare 100MB limit) ──────
    const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

    if (pathname === '/api/upload/init' && method === 'POST') {
      const body = await parseBody(req);
      if (body.totalSize && body.totalSize > MAX_UPLOAD_SIZE) {
        return sendError(res, `Arquivo muito grande (${(body.totalSize / 1048576).toFixed(0)}MB). Limite: 2GB.`, 413);
      }
      const uploadId = require('crypto').randomUUID();
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads', uploadId);
      fs.mkdirSync(tmpDir, { recursive: true });
      const filename = (body.filename || `upload-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify({
        filename, totalSize: body.totalSize || 0, totalChunks: body.totalChunks || 0, received: 0
      }));
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
        sendJSON(res, { ok: true, chunk: chunkIndex, received: meta.received });
      });
      ws.on('error', (err) => sendError(res, `Chunk upload failed: ${err.message}`, 500));
      return;
    }

    if (pathname === '/api/upload/complete' && method === 'POST') {
      const body = await parseBody(req);
      const uploadId = body.uploadId;
      if (!uploadId) return sendError(res, 'uploadId required');
      const tmpDir = path.join(require('os').tmpdir(), 'aiox-av-uploads', uploadId);
      if (!fs.existsSync(tmpDir)) return sendError(res, 'Upload session not found', 404);
      const meta = JSON.parse(fs.readFileSync(path.join(tmpDir, 'meta.json'), 'utf8'));
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
        sendJSON(res, { uploaded: true, path: finalPath, filename: meta.filename }, 201);
      });
      ws.on('error', (err) => sendError(res, `Assembly failed: ${err.message}`, 500));
      return;
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
    console.log('');
  });
  return server;
}

module.exports = { createServer, handleRequest, DEFAULT_PORT };
