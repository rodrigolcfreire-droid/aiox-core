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

const DEFAULT_PORT = 3456;

// Rate limiting — 30 requests per minute per IP (zero deps)
const RATE_LIMIT = 30;
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

  // Log access for security monitoring
  if (req.url.startsWith('/api/')) logAccess(req);

  // Rate limit check (skip for SSE and static files)
  const isSSE = req.url.includes('/events');
  const isStatic = !req.url.startsWith('/api/');
  if (!isSSE && !isStatic && !checkRateLimit(req, res)) {
    logRateLimitHit(req);
    return;
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

      // Copy assembled files to output/ as final-{cutId}.mp4
      const outputDir = path.join(getProjectDir(id), 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      const finals = [];
      for (const a of assembled) {
        const finalPath = path.join(outputDir, `final-${a.cutId}.mp4`);
        fs.copyFileSync(a.outputPath, finalPath);
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

      addClient(projectId, res);
      req.on('close', () => removeClient(projectId, res));
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
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(htmlPath).pipe(res);
    }

    // Serve approval page for a specific project
    if (pathname.match(/^\/av\/[^/]+\/approve$/) && method === 'GET') {
      const projectId = pathname.split('/')[2];
      const approvalHtml = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'av-approve.html');
      if (!fs.existsSync(approvalHtml)) return sendError(res, 'Approval page not found', 404);
      let html = fs.readFileSync(approvalHtml, 'utf8');
      html = html.replace('__PROJECT_ID__', projectId);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
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
      const range = req.headers.range;
      if (range) {
        const rp = range.replace(/bytes=/, '').split('-');
        const s = parseInt(rp[0], 10);
        const e = rp[1] ? parseInt(rp[1], 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' });
        return fs.createReadStream(pp, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' });
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

    // ── Security Status ─────────────────────────────
    if (pathname === '/api/security' && method === 'GET') {
      return sendJSON(res, getSecurityStatus());
    }

    // ── Health ────────────────────────────────────────
    if (pathname === '/api/health') {
      return sendJSON(res, { status: 'ok', service: 'central-audiovisual', timestamp: new Date().toISOString() });
    }

    // ── Serve Dashboard (Centro de Comando) ──────────
    if (pathname === '/' || pathname === '/index.html') {
      const dashPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center', 'index.html');
      if (!fs.existsSync(dashPath)) return sendError(res, 'Dashboard not found', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(dashPath).pipe(res);
    }

    // ── Serve static files from ux-command-center ────
    const uxDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'examples', 'ux-command-center');
    const safePath = path.join(uxDir, pathname.replace(/^\//, ''));
    if (safePath.startsWith(uxDir) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      const mimeMap = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
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
