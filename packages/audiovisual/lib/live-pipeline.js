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
const { getProjectDir } = require('./project');
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

function broadcast(projectId, event, data) {
  const conns = clients.get(projectId) || [];
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); } catch { /* client disconnected */ }
  }

  // Also save to state file for page refresh
  const stateDir = path.join(getProjectDir(projectId));
  if (fs.existsSync(stateDir)) {
    const statePath = path.join(stateDir, 'pipeline-state.json');
    let state = { events: [] };
    if (fs.existsSync(statePath)) {
      try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* ignore */ }
    }
    state.events.push({ event, data, timestamp: new Date().toISOString() });
    state.lastEvent = event;
    state.lastData = data;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
}

async function runLivePipeline(source, options = {}) {
  const projectId = options.projectId || null;

  // Step 1: Ingest
  broadcast(projectId || 'pending', 'step', { step: 'ingest', status: 'running', message: 'Ingerindo video...' });

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

    broadcast(result.projectId, 'step', {
      step: 'ingest',
      status: 'done',
      projectId: result.projectId,
      message: `Projeto criado: ${result.projectId}`,
      metadata: result.metadata,
    });
  } catch (err) {
    broadcast(projectId || 'pending', 'step', { step: 'ingest', status: 'error', message: err.message });
    broadcast(projectId || 'pending', 'pipeline', { status: 'error', error: err.message });
    throw err;
  }

  const pid = result.projectId;

  // Step 2: Transcribe
  broadcast(pid, 'step', { step: 'transcribe', status: 'running', message: 'Transcrevendo audio...' });
  try {
    if (options.srt) {
      importSRT(pid, options.srt);
    } else {
      await transcribeWithWhisper(pid);
    }
    const transcriptionPath = path.join(getProjectDir(pid), 'analysis', 'transcription.json');
    const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
    broadcast(pid, 'step', {
      step: 'transcribe',
      status: 'done',
      message: `${transcription.segments.length} segmentos, ${transcription.totalWords} palavras`,
      segments: transcription.segments.length,
      words: transcription.totalWords,
      language: transcription.language,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'transcribe', status: 'error', message: err.message });
    broadcast(pid, 'pipeline', { status: 'error', step: 'transcribe', error: err.message });
    throw err;
  }

  // Step 2b: LLM Hook Detection (AV-11)
  if (isLLMAvailable()) {
    broadcast(pid, 'step', { step: 'llm-hooks', status: 'running', message: 'IA analisando melhores hooks...' });
    try {
      const llmHooks = await detectHooksWithLLM(pid);
      if (llmHooks && llmHooks.hooks) {
        broadcast(pid, 'step', {
          step: 'llm-hooks',
          status: 'done',
          message: `IA encontrou ${llmHooks.hooks.length} hooks semanticos`,
          hooks: llmHooks.hooks,
        });
      }
    } catch (err) {
      broadcast(pid, 'step', { step: 'llm-hooks', status: 'error', message: err.message });
    }
  }

  // Step 3: Segment
  broadcast(pid, 'step', { step: 'segment', status: 'running', message: 'Segmentando em blocos...' });
  try {
    const segments = segmentVideo(pid);
    broadcast(pid, 'step', {
      step: 'segment',
      status: 'done',
      message: `${segments.totalBlocks} blocos identificados`,
      blocks: segments.blocks,
      totalBlocks: segments.totalBlocks,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'segment', status: 'error', message: err.message });
    throw err;
  }

  // Step 4: Describe
  broadcast(pid, 'step', { step: 'describe', status: 'running', message: 'Descrevendo conteudo...' });
  try {
    const desc = generateDescription(pid);
    broadcast(pid, 'step', {
      step: 'describe',
      status: 'done',
      message: desc.summary.slice(0, 100),
      keywords: desc.keywords.slice(0, 5).map(k => k.word),
      topics: desc.topics.slice(0, 5),
      suggestedTitles: desc.suggestedTitles,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'describe', status: 'error', message: err.message });
  }

  // Step 5: Smart Cuts
  broadcast(pid, 'step', { step: 'cuts', status: 'running', message: 'Gerando cortes inteligentes...' });
  try {
    const cuts = generateSmartCuts(pid);
    broadcast(pid, 'step', {
      step: 'cuts',
      status: 'done',
      message: `${cuts.totalSuggested} cortes sugeridos`,
      cuts: cuts.suggestedCuts,
      totalSuggested: cuts.totalSuggested,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'cuts', status: 'error', message: err.message });
    throw err;
  }

  // Step 5a: LLM Viral Titles (AV-11)
  if (isLLMAvailable()) {
    broadcast(pid, 'step', { step: 'llm-titles', status: 'running', message: 'IA gerando titulos virais...' });
    try {
      const titles = await generateViralTitles(pid);
      if (titles && titles.titles) {
        broadcast(pid, 'step', {
          step: 'llm-titles',
          status: 'done',
          message: `IA gerou titulos para ${titles.titles.length} cortes`,
          titles: titles.titles,
        });
      }
    } catch (err) {
      broadcast(pid, 'step', { step: 'llm-titles', status: 'error', message: err.message });
    }
  }

  // Step 5b: Energy Detection (AV-10)
  broadcast(pid, 'step', { step: 'energy', status: 'running', message: 'Detectando pico de energia...' });
  try {
    const energy = detectEnergy(pid);
    broadcast(pid, 'step', {
      step: 'energy',
      status: 'done',
      message: `Pico em ${energy.peakWindow.start}s (${energy.peakWindow.meanVolume.toFixed(1)} dB)`,
      peakWindow: energy.peakWindow,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'energy', status: 'error', message: err.message });
  }

  // Step 5c: Generate Previews (AV-10)
  broadcast(pid, 'step', { step: 'previews', status: 'running', message: 'Gerando previews com hook...' });
  try {
    const previews = generateCutPreviews(pid);
    broadcast(pid, 'step', {
      step: 'previews',
      status: 'done',
      message: `${previews.total} previews gerados${previews.hookIncluded ? ' (com hook)' : ''}`,
      total: previews.total,
      hookIncluded: previews.hookIncluded,
    });
  } catch (err) {
    broadcast(pid, 'step', { step: 'previews', status: 'error', message: err.message });
  }

  // Step 6: Suggestions
  broadcast(pid, 'step', { step: 'suggestions', status: 'running', message: 'Analisando melhorias...' });
  try {
    const suggestions = generateSuggestions(pid);
    broadcast(pid, 'step', {
      step: 'suggestions',
      status: 'done',
      message: `${suggestions.totalSuggestions} sugestao(es)`,
      suggestions: suggestions.suggestions,
    });
  } catch { /* optional */ }

  // Pipeline complete — waiting for approval
  broadcast(pid, 'pipeline', {
    status: 'waiting_approval',
    projectId: pid,
    message: 'Analise completa. Aguardando aprovacao dos cortes.',
  });

  return result;
}

function getPipelineState(projectId) {
  const statePath = path.join(getProjectDir(projectId), 'pipeline-state.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

module.exports = {
  runLivePipeline,
  addClient,
  removeClient,
  broadcast,
  getPipelineState,
  clients,
};
