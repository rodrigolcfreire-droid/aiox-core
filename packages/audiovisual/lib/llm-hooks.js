#!/usr/bin/env node
'use strict';

/**
 * llm-hooks.js — LLM-powered hook detection and title generation
 * Story: AV-11
 *
 * Uses Claude to semantically analyze transcription and find
 * the most impactful moments for hooks, plus generate viral titles.
 */

const fs = require('fs');
const path = require('path');
const { isLLMAvailable, callClaudeJSON } = require('./llm-client');
const { getProjectDir } = require('./project');

const SYSTEM_PROMPT = `Voce e um especialista em producao de conteudo viral para Reels, TikTok e Shorts.
Sua funcao e analisar transcricoes de videos e identificar:
1. Os momentos mais impactantes para usar como HOOK (primeiros 5 segundos)
2. Titulos virais que maximizam engajamento
Responda sempre em portugues brasileiro.`;

/**
 * Analyze transcription to find the best hook moments.
 * Returns ranked list of hook candidates with timestamps and reasoning.
 */
async function detectHooksWithLLM(projectId) {
  if (!isLLMAvailable()) {
    return null; // Fallback to energy-based detection
  }

  const projectDir = getProjectDir(projectId);
  const transcriptionPath = path.join(projectDir, 'analysis', 'transcription.json');
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error('No transcription found for LLM hook detection');
  }

  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
  const segments = transcription.segments || [];

  // Build condensed transcript with timestamps
  const transcript = segments
    .map(s => `[${formatTime(s.start)}-${formatTime(s.end)}] ${s.text}`)
    .join('\n');

  // Truncate to ~4000 chars to stay within token limits
  const truncated = transcript.length > 4000
    ? transcript.substring(0, 4000) + '\n[... transcricao truncada ...]'
    : transcript;

  const prompt = `Analise esta transcricao de video e encontre os 5 melhores momentos para usar como HOOK (primeiros 5 segundos de um Reels/TikTok).

Um bom hook e um momento que:
- Gera curiosidade imediata
- Tem energia alta (risada, surpresa, exclamacao)
- Faz a pessoa parar de rolar o feed
- Tem uma frase impactante ou controversa
- Mostra um resultado impressionante

TRANSCRICAO:
${truncated}

Retorne um JSON com esta estrutura:
{
  "hooks": [
    {
      "start": <segundo de inicio>,
      "end": <segundo de fim (start + 5)>,
      "text": "<trecho da transcricao>",
      "reason": "<por que este e um bom hook>",
      "score": <1-10>,
      "type": "<curiosidade|energia|controversia|resultado|emocao>"
    }
  ]
}`;

  try {
    const result = await callClaudeJSON(prompt, { system: SYSTEM_PROMPT });
    console.log(`  LLM detected ${(result.hooks || []).length} hook candidates`);

    // Save LLM hooks analysis
    const analysisDir = path.join(projectDir, 'analysis');
    fs.writeFileSync(
      path.join(analysisDir, 'llm-hooks.json'),
      JSON.stringify({ ...result, analyzedAt: new Date().toISOString() }, null, 2),
    );

    return result;
  } catch (err) {
    console.error(`  LLM hook detection failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate viral titles and descriptions for each cut.
 */
async function generateViralTitles(projectId) {
  if (!isLLMAvailable()) {
    return null;
  }

  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const transcriptionPath = path.join(projectDir, 'analysis', 'transcription.json');

  if (!fs.existsSync(cutsPath) || !fs.existsSync(transcriptionPath)) {
    return null;
  }

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
  const segments = transcription.segments || [];

  // Get transcript text for each cut
  const cutSummaries = cutsData.suggestedCuts.slice(0, 10).map(cut => {
    const cutSegments = segments.filter(s => s.start >= cut.start && s.end <= cut.end);
    const text = cutSegments.map(s => s.text).join(' ').substring(0, 300);
    return {
      id: cut.id,
      category: cut.category,
      duration: cut.duration,
      text,
    };
  });

  const prompt = `Para cada corte de video abaixo, gere:
1. Um titulo viral (max 60 chars) — que funcione como titulo de Reels/TikTok
2. Uma descricao curta (max 150 chars) — com hashtags relevantes
3. Um CTA (call-to-action) — frase pra engajar nos comentarios

CORTES:
${cutSummaries.map(c => `[${c.id}] (${c.category}, ${c.duration?.toFixed(0)}s): "${c.text}"`).join('\n\n')}

Retorne JSON:
{
  "titles": [
    {
      "cutId": "<id do corte>",
      "title": "<titulo viral>",
      "description": "<descricao com hashtags>",
      "cta": "<call to action>"
    }
  ]
}`;

  try {
    const result = await callClaudeJSON(prompt, { system: SYSTEM_PROMPT });
    console.log(`  LLM generated titles for ${(result.titles || []).length} cuts`);

    // Apply titles to cuts data
    for (const title of (result.titles || [])) {
      const cut = cutsData.suggestedCuts.find(c => c.id === title.cutId);
      if (cut) {
        cut.viralTitle = title.title;
        cut.viralDescription = title.description;
        cut.viralCTA = title.cta;
      }
    }

    // Save updated cuts with titles
    fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));

    // Save LLM titles analysis
    fs.writeFileSync(
      path.join(projectDir, 'analysis', 'llm-titles.json'),
      JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2),
    );

    return result;
  } catch (err) {
    console.error(`  LLM title generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Load previously computed LLM hooks for a project.
 */
function loadLLMHooks(projectId) {
  const hooksPath = path.join(getProjectDir(projectId), 'analysis', 'llm-hooks.json');
  if (!fs.existsSync(hooksPath)) return null;
  return JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  detectHooksWithLLM,
  generateViralTitles,
  loadLLMHooks,
  isLLMAvailable,
};
