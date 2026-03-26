#!/usr/bin/env node
'use strict';

/**
 * live-pipeline.js — Real-time pipeline with Server-Sent Events
 *
 * Executes the audiovisual pipeline and streams progress
 * to connected clients via SSE.
 */

const fs = require('fs');
const path = require('path');
const { ingest } = require('./ingest');
const { transcribeWithWhisper, importSRT } = require('./transcribe');
const { segmentVideo } = require('./segment');
const { generateSmartCuts } = require('./smart-cuts');
const { generateDescription } = require('./describe');
const { generateSuggestions } = require('./suggestions');
const { getProjectDir, loadProject } = require('./project');
const { detectEnergy } = require('./energy-detector');
const { generateCutPreviews } = require('./assemble');
const { detectHooksWithLLM, generateViralTitles, isLLMAvailable } = require('./llm-hooks');

// Active SSE connections
const clients = new Map();

function addClient(projectId, res) {
  if (!clients.has(projectId)) clients.set(projectId, []);
  clients.get(projectId).push(res);
}

function removeClient(projectId, res) {
  if (!clients.has(projectId)) return;
  const arr = clients.get(projectId).filter(r => r !== res);
  if (arr.length === 0) clients.delete(projectId);
  else clients.set(projectId, arr);
}

// In-memory pipeline state — works for 'pending' and real projectIds
const pipelineStates = new Map();

function broadcast(projectId, event, data) {
  const conns = clients.get(projectId) || [];
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); } catch { /* client disconnected */ }
  }

  // Save to in-memory state (works for 'pending' too)
  if (!pipelineStates.has(projectId)) pipelineStates.set(projectId, { events: [] });
  const state = pipelineStates.get(projectId);
  state.events.push({ event, data, timestamp: new Date().toISOString() });
  state.lastEvent = event;
  state.lastData = data;

  // If we get a real projectId from a pending pipeline, copy state
  if (data.projectId && projectId === data.projectId && pipelineStates.has('pending')) {
    const pendingState = pipelineStates.get('pending');
    // Merge pending events into real project state
    for (const evt of pendingState.events) {
      if (!state.events.find(e => e.timestamp === evt.timestamp)) {
        state.events.unshift(evt);
      }
    }
    pipelineStates.delete('pending');
  }

  // Also persist to disk if project dir exists
  try {
    const stateDir = getProjectDir(projectId);
    if (fs.existsSync(stateDir)) {
      fs.writeFileSync(path.join(stateDir, 'pipeline-state.json'), JSON.stringify(state, null, 2));
    }
  } catch { /* ignore for 'pending' */ }
}

async function runLivePipeline(source, options = {}) {
  const projectId = options.projectId || null;
  const pipelineStart = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] === Pipeline started === source: ${source}`);

  // Step 1: Ingest
  broadcast(projectId || 'pending', 'step', { step: 'ingest', status: 'running', message: 'Ingerindo video...' });
  const stepStart_ingest = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: ingest`);

  let result;
  try {
    result = await ingest(source, options);

    // Migrate pending SSE clients to real projectId
    const pendingClients = clients.get('pending') || [];
    if (pendingClients.length > 0) {
      if (!clients.has(result.projectId)) clients.set(result.projectId, []);
      clients.get(result.projectId).push(...pendingClients);
      clients.delete('pending');
    }

    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: ingest (${Date.now() - stepStart_ingest}ms) — projectId: ${result.projectId}`);
    broadcast(result.projectId, 'step', {
      step: 'ingest',
      status: 'done',
      projectId: result.projectId,
      message: `Projeto criado: ${result.projectId}`,
      metadata: result.metadata,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: ingest (${Date.now() - stepStart_ingest}ms) — ${err.message}`);
    broadcast(projectId || 'pending', 'step', { step: 'ingest', status: 'error', message: err.message });
    broadcast(projectId || 'pending', 'pipeline', { status: 'error', error: err.message });
    throw err;
  }

  const pid = result.projectId;
  const projectDir = getProjectDir(pid);

  // Helper: check if a file exists and is non-empty
  const hasCache = (relPath) => {
    const fullPath = path.join(projectDir, relPath);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).size > 10;
  };

  // Step 2: Transcribe
  const stepStart_transcribe = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: transcribe`);
  const transcriptionPath = path.join(projectDir, 'analysis', 'transcription.json');
  if (hasCache('analysis/transcription.json')) {
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: transcribe (cache hit, ${Date.now() - stepStart_transcribe}ms)`);
    const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
    broadcast(pid, 'step', {
      step: 'transcribe',
      status: 'done',
      message: `(cache) ${transcription.segments.length} segmentos, ${transcription.totalWords} palavras`,
      segments: transcription.segments.length,
      words: transcription.totalWords,
      language: transcription.language,
    });
  } else {
    broadcast(pid, 'step', { step: 'transcribe', status: 'running', message: 'Transcrevendo audio...' });
    try {
      if (options.srt) {
        console.log(`[${new Date().toISOString()}] [PIPELINE] Whisper: using SRT import`);
        importSRT(pid, options.srt);
      } else {
        console.log(`[${new Date().toISOString()}] [PIPELINE] Whisper: starting transcription`);
        await transcribeWithWhisper(pid);
      }
      console.log(`[${new Date().toISOString()}] [PIPELINE] Whisper: success (${Date.now() - stepStart_transcribe}ms)`);
      const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: transcribe (${Date.now() - stepStart_transcribe}ms) — ${transcription.segments.length} segments, ${transcription.totalWords} words`);
      broadcast(pid, 'step', {
        step: 'transcribe',
        status: 'done',
        message: `${transcription.segments.length} segmentos, ${transcription.totalWords} palavras`,
        segments: transcription.segments.length,
        words: transcription.totalWords,
        language: transcription.language,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Whisper: failed (${Date.now() - stepStart_transcribe}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'transcribe', status: 'error', message: err.message });
      broadcast(pid, 'pipeline', { status: 'error', step: 'transcribe', error: err.message });
      throw err;
    }
  }

  // Step 2b: LLM Hook Detection (AV-11)
  if (isLLMAvailable()) {
    const stepStart_llmHooks = Date.now();
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: llm-hooks`);
    broadcast(pid, 'step', { step: 'llm-hooks', status: 'running', message: 'IA analisando melhores hooks...' });
    try {
      const llmHooks = await detectHooksWithLLM(pid);
      if (llmHooks && llmHooks.hooks) {
        console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: llm-hooks (${Date.now() - stepStart_llmHooks}ms) — ${llmHooks.hooks.length} hooks found`);
        broadcast(pid, 'step', {
          step: 'llm-hooks',
          status: 'done',
          message: `IA encontrou ${llmHooks.hooks.length} hooks semanticos`,
          hooks: llmHooks.hooks,
        });
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: llm-hooks (${Date.now() - stepStart_llmHooks}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'llm-hooks', status: 'error', message: err.message });
    }
  }

  // Step 3: Segment
  const stepStart_segment = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: segment`);
  if (hasCache('analysis/segments.json')) {
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: segment (cache hit, ${Date.now() - stepStart_segment}ms)`);
    const segData = JSON.parse(fs.readFileSync(path.join(projectDir, 'analysis', 'segments.json'), 'utf8'));
    broadcast(pid, 'step', {
      step: 'segment',
      status: 'done',
      message: `(cache) ${segData.totalBlocks} blocos identificados`,
      blocks: segData.blocks,
      totalBlocks: segData.totalBlocks,
    });
  } else {
    broadcast(pid, 'step', { step: 'segment', status: 'running', message: 'Segmentando em blocos...' });
    try {
      const segments = segmentVideo(pid);
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: segment (${Date.now() - stepStart_segment}ms) — ${segments.totalBlocks} blocks`);
      broadcast(pid, 'step', {
        step: 'segment',
        status: 'done',
        message: `${segments.totalBlocks} blocos identificados`,
        blocks: segments.blocks,
        totalBlocks: segments.totalBlocks,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: segment (${Date.now() - stepStart_segment}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'segment', status: 'error', message: err.message });
      throw err;
    }
  }

  // Step 4: Describe
  const stepStart_describe = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: describe`);
  if (hasCache('analysis/description.json')) {
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: describe (cache hit, ${Date.now() - stepStart_describe}ms)`);
    const desc = JSON.parse(fs.readFileSync(path.join(projectDir, 'analysis', 'description.json'), 'utf8'));
    broadcast(pid, 'step', {
      step: 'describe',
      status: 'done',
      message: `(cache) ${(desc.summary || '').slice(0, 100)}`,
      keywords: (desc.keywords || []).slice(0, 5).map(k => k.word),
      topics: (desc.topics || []).slice(0, 5),
      suggestedTitles: desc.suggestedTitles,
    });
  } else {
    broadcast(pid, 'step', { step: 'describe', status: 'running', message: 'Descrevendo conteudo...' });
    try {
      const desc = generateDescription(pid);
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: describe (${Date.now() - stepStart_describe}ms)`);
      broadcast(pid, 'step', {
        step: 'describe',
        status: 'done',
        message: desc.summary.slice(0, 100),
        keywords: desc.keywords.slice(0, 5).map(k => k.word),
        topics: desc.topics.slice(0, 5),
        suggestedTitles: desc.suggestedTitles,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: describe (${Date.now() - stepStart_describe}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'describe', status: 'error', message: err.message });
    }
  }

  // Step 5: Smart Cuts
  const stepStart_cuts = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: cuts`);
  if (hasCache('cuts/suggested-cuts.json')) {
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: cuts (cache hit, ${Date.now() - stepStart_cuts}ms)`);
    const cutsData = JSON.parse(fs.readFileSync(path.join(projectDir, 'cuts', 'suggested-cuts.json'), 'utf8'));
    broadcast(pid, 'step', {
      step: 'cuts',
      status: 'done',
      message: `(cache) ${cutsData.totalSuggested} cortes sugeridos`,
      cuts: cutsData.suggestedCuts,
      totalSuggested: cutsData.totalSuggested,
    });
  } else {
    broadcast(pid, 'step', { step: 'cuts', status: 'running', message: 'Gerando cortes inteligentes...' });
    try {
      const cuts = generateSmartCuts(pid);
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: cuts (${Date.now() - stepStart_cuts}ms) — ${cuts.totalSuggested} cuts`);
      broadcast(pid, 'step', {
        step: 'cuts',
        status: 'done',
        message: `${cuts.totalSuggested} cortes sugeridos`,
        cuts: cuts.suggestedCuts,
        totalSuggested: cuts.totalSuggested,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: cuts (${Date.now() - stepStart_cuts}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'cuts', status: 'error', message: err.message });
      throw err;
    }
  }

  // Step 5a: LLM Viral Titles (AV-11)
  if (isLLMAvailable()) {
    const stepStart_llmTitles = Date.now();
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: llm-titles`);
    broadcast(pid, 'step', { step: 'llm-titles', status: 'running', message: 'IA gerando titulos virais...' });
    try {
      const titles = await generateViralTitles(pid);
      if (titles && titles.titles) {
        console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: llm-titles (${Date.now() - stepStart_llmTitles}ms) — ${titles.titles.length} titles`);
        broadcast(pid, 'step', {
          step: 'llm-titles',
          status: 'done',
          message: `IA gerou titulos para ${titles.titles.length} cortes`,
          titles: titles.titles,
        });
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] Step failed: llm-titles (${Date.now() - stepStart_llmTitles}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'llm-titles', status: 'error', message: err.message });
    }
  }

  // Step 5b: Energy Detection (AV-10)
  // Skip for long videos (>600s) — FFmpeg volumedetect blocks the event loop
  const MAX_ENERGY_DURATION = 600; // 10 minutes
  const projectMeta = loadProject(pid);
  const videoDuration = projectMeta.duration || result.metadata?.durationSeconds || 0;

  if (videoDuration > MAX_ENERGY_DURATION) {
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step skipped: energy (video ${Math.floor(videoDuration / 60)}min > 10min limit)`);
    broadcast(pid, 'step', {
      step: 'energy',
      status: 'skipped',
      message: `Energy detection pulada (video ${Math.floor(videoDuration / 60)}min > limite 10min). Use o CLI para rodar offline.`,
    });
  } else {
    const stepStart_energy = Date.now();
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: energy (FFmpeg volumedetect)`);
    broadcast(pid, 'step', { step: 'energy', status: 'running', message: 'Detectando pico de energia...' });
    try {
      const energy = detectEnergy(pid);
      console.log(`[${new Date().toISOString()}] [PIPELINE] FFmpeg volumedetect: success (${Date.now() - stepStart_energy}ms)`);
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: energy (${Date.now() - stepStart_energy}ms) — peak at ${energy.peakWindow.start}s`);
      broadcast(pid, 'step', {
        step: 'energy',
        status: 'done',
        message: `Pico em ${energy.peakWindow.start}s (${energy.peakWindow.meanVolume.toFixed(1)} dB)`,
        peakWindow: energy.peakWindow,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] FFmpeg volumedetect: failed (${Date.now() - stepStart_energy}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'energy', status: 'error', message: err.message });
    }
  }

  // Step 5c: Generate Previews (AV-10)
  // Always generate previews — they are fast (just extract segments)
  {
    const stepStart_previews = Date.now();
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: previews (FFmpeg extract)`);
    broadcast(pid, 'step', { step: 'previews', status: 'running', message: 'Gerando previews com hook...' });
    try {
      const previews = generateCutPreviews(pid);
      console.log(`[${new Date().toISOString()}] [PIPELINE] FFmpeg extract: success (${Date.now() - stepStart_previews}ms)`);
      console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: previews (${Date.now() - stepStart_previews}ms) — ${previews.total} previews`);
      broadcast(pid, 'step', {
        step: 'previews',
        status: 'done',
        message: `${previews.total} previews gerados${previews.hookIncluded ? ' (com hook)' : ''}`,
        total: previews.total,
        hookIncluded: previews.hookIncluded,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PIPELINE] FFmpeg extract: failed (${Date.now() - stepStart_previews}ms) — ${err.message}`);
      broadcast(pid, 'step', { step: 'previews', status: 'error', message: err.message });
    }
  }

  // Step 6: Suggestions
  const stepStart_suggestions = Date.now();
  console.log(`[${new Date().toISOString()}] [PIPELINE] Step started: suggestions`);
  broadcast(pid, 'step', { step: 'suggestions', status: 'running', message: 'Analisando melhorias...' });
  try {
    const suggestions = generateSuggestions(pid);
    console.log(`[${new Date().toISOString()}] [PIPELINE] Step completed: suggestions (${Date.now() - stepStart_suggestions}ms) — ${suggestions.totalSuggestions} suggestions`);
    broadcast(pid, 'step', {
      step: 'suggestions',
      status: 'done',
      message: `${suggestions.totalSuggestions} sugestao(es)`,
      suggestions: suggestions.suggestions,
    });
  } catch { /* optional */ }

  // Pipeline complete — waiting for approval
  const totalDuration = Date.now() - pipelineStart;
  console.log(`[${new Date().toISOString()}] [PIPELINE] === Pipeline complete === projectId: ${pid}, total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
  broadcast(pid, 'pipeline', {
    status: 'waiting_approval',
    projectId: pid,
    message: 'Analise completa. Aguardando aprovacao dos cortes.',
  });

  return result;
}

function getPipelineState(projectId) {
  // Check in-memory first (always up to date)
  if (pipelineStates.has(projectId)) {
    return pipelineStates.get(projectId);
  }
  // Fall back to disk
  try {
    const statePath = path.join(getProjectDir(projectId), 'pipeline-state.json');
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

module.exports = {
  runLivePipeline,
  addClient,
  removeClient,
  broadcast,
  getPipelineState,
  pipelineStates,
  clients,
};
