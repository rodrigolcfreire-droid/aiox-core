#!/usr/bin/env node
'use strict';

/**
 * suggestions.js — Improvement suggestion engine
 * Story: AV-8.2
 *
 * Analisa cortes e sugere melhorias baseado em
 * padroes aprendidos, ritmo, duracao e estrutura.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');

const SUGGESTION_TYPES = {
  HOOK: 'hook',
  RITMO: 'ritmo',
  DURACAO: 'duracao',
  ESTRUTURA: 'estrutura',
  LEGENDA: 'legenda',
  ENGAJAMENTO: 'engajamento',
};

function analyzeHook(blocks) {
  const suggestions = [];
  if (!blocks || blocks.length === 0) return suggestions;

  const firstBlock = blocks[0];

  // Hook too long
  if (firstBlock.type === 'hook' && firstBlock.duration > 8) {
    suggestions.push({
      type: SUGGESTION_TYPES.HOOK,
      priority: 'high',
      message: `Hook muito longo (${firstBlock.duration.toFixed(1)}s). Ideal: 3-5s para reter atencao.`,
      action: 'Cortar hook para maximo 5 segundos',
    });
  }

  // No hook — starts with intro
  if (firstBlock.type === 'intro') {
    suggestions.push({
      type: SUGGESTION_TYPES.HOOK,
      priority: 'high',
      message: 'Video comeca com intro, sem hook. Perde atencao nos primeiros segundos.',
      action: 'Adicionar gancho forte antes da introducao',
    });
  }

  // Low energy hook
  if (firstBlock.type === 'hook' && firstBlock.energyLevel === 'low') {
    suggestions.push({
      type: SUGGESTION_TYPES.HOOK,
      priority: 'medium',
      message: 'Hook com energia baixa. Hooks virais tem ritmo rapido.',
      action: 'Usar frase impactante ou pergunta provocativa',
    });
  }

  return suggestions;
}

function analyzeRitmo(blocks) {
  const suggestions = [];
  if (!blocks || blocks.length < 2) return suggestions;

  // All same energy level
  const energies = blocks.map(b => b.energyLevel);
  const allSame = energies.every(e => e === energies[0]);
  if (allSame) {
    suggestions.push({
      type: SUGGESTION_TYPES.RITMO,
      priority: 'medium',
      message: `Ritmo monotono: todos os blocos com energia "${energies[0]}". Falta variacao.`,
      action: 'Alternar blocos de alta e media energia para manter atencao',
    });
  }

  // Long blocks without variation
  const longBlocks = blocks.filter(b => b.duration > 30);
  if (longBlocks.length > 0) {
    suggestions.push({
      type: SUGGESTION_TYPES.RITMO,
      priority: 'low',
      message: `${longBlocks.length} bloco(s) com mais de 30s. Blocos longos perdem retencao.`,
      action: 'Considerar dividir blocos longos com cortes ou inserts visuais',
    });
  }

  return suggestions;
}

function analyzeDuracao(cuts, learnings) {
  const suggestions = [];
  if (!cuts || cuts.length === 0) return suggestions;

  // Check against learned preferences
  if (learnings && learnings.patterns) {
    const durPref = learnings.patterns.find(p => p.type === 'duration_preference');
    if (durPref && durPref.preferredRange) {
      const outOfRange = cuts.filter(c =>
        c.duration < durPref.preferredRange.min || c.duration > durPref.preferredRange.max
      );
      if (outOfRange.length > 0) {
        suggestions.push({
          type: SUGGESTION_TYPES.DURACAO,
          priority: 'medium',
          message: `${outOfRange.length} corte(s) fora da duracao preferida (${durPref.preferredRange.min}s-${durPref.preferredRange.max}s).`,
          action: `Ajustar para ficar entre ${durPref.preferredRange.min}s e ${durPref.preferredRange.max}s`,
          affectedCuts: outOfRange.map(c => c.id),
        });
      }
    }
  }

  // Very short cuts
  const tooShort = cuts.filter(c => c.duration < 10);
  if (tooShort.length > 0) {
    suggestions.push({
      type: SUGGESTION_TYPES.DURACAO,
      priority: 'low',
      message: `${tooShort.length} corte(s) com menos de 10s. Muito curto para engajar.`,
      action: 'Combinar com outro bloco ou estender',
      affectedCuts: tooShort.map(c => c.id),
    });
  }

  return suggestions;
}

function analyzeEstrutura(blocks) {
  const suggestions = [];
  if (!blocks || blocks.length === 0) return suggestions;

  const types = blocks.map(b => b.type);

  // No CTA
  if (!types.includes('cta')) {
    suggestions.push({
      type: SUGGESTION_TYPES.ESTRUTURA,
      priority: 'high',
      message: 'Nenhum bloco CTA detectado. Sem call-to-action o video nao converte.',
      action: 'Adicionar CTA no final ou entre blocos de conteudo',
    });
  }

  // CTA before content
  const ctaIdx = types.indexOf('cta');
  const lastContentIdx = types.lastIndexOf('content');
  if (ctaIdx !== -1 && lastContentIdx !== -1 && ctaIdx < lastContentIdx) {
    suggestions.push({
      type: SUGGESTION_TYPES.ESTRUTURA,
      priority: 'medium',
      message: 'CTA aparece antes de conteudo. Melhor posicionar CTA apos entregar valor.',
      action: 'Mover CTA para depois do bloco de conteudo principal',
    });
  }

  return suggestions;
}

function analyzeEngagement(cuts, learnings) {
  const suggestions = [];
  if (!cuts || cuts.length === 0) return suggestions;

  if (learnings && learnings.patterns) {
    const engPref = learnings.patterns.find(p => p.type === 'engagement_correlation');
    if (engPref && engPref.threshold > 0) {
      const lowScore = cuts.filter(c => c.engagementScore < engPref.threshold);
      if (lowScore.length > 0) {
        suggestions.push({
          type: SUGGESTION_TYPES.ENGAJAMENTO,
          priority: 'medium',
          message: `${lowScore.length} corte(s) abaixo do score minimo aprendido (${engPref.threshold}).`,
          action: 'Reconsiderar esses cortes ou melhorar hook/energia',
          affectedCuts: lowScore.map(c => c.id),
        });
      }
    }
  }

  return suggestions;
}

function generateSuggestions(projectId) {
  const projectDir = getProjectDir(projectId);

  // Load segments
  let blocks = null;
  const segPath = path.join(projectDir, 'analysis', 'segments.json');
  if (fs.existsSync(segPath)) {
    blocks = JSON.parse(fs.readFileSync(segPath, 'utf8')).blocks;
  }

  // Load cuts
  let cuts = null;
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  if (fs.existsSync(cutsPath)) {
    cuts = JSON.parse(fs.readFileSync(cutsPath, 'utf8')).suggestedCuts;
  }

  // Load learnings
  let learnings = null;
  const learnPath = path.join(projectDir, 'data', 'learnings.json');
  if (fs.existsSync(learnPath)) {
    learnings = JSON.parse(fs.readFileSync(learnPath, 'utf8'));
  }

  const allSuggestions = [
    ...analyzeHook(blocks),
    ...analyzeRitmo(blocks),
    ...analyzeDuracao(cuts, learnings),
    ...analyzeEstrutura(blocks),
    ...analyzeEngagement(cuts, learnings),
  ];

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  allSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const result = {
    suggestions: allSuggestions,
    totalSuggestions: allSuggestions.length,
    byPriority: {
      high: allSuggestions.filter(s => s.priority === 'high').length,
      medium: allSuggestions.filter(s => s.priority === 'medium').length,
      low: allSuggestions.filter(s => s.priority === 'low').length,
    },
    byType: Object.fromEntries(
      Object.values(SUGGESTION_TYPES).map(t => [t, allSuggestions.filter(s => s.type === t).length])
    ),
    generatedAt: new Date().toISOString(),
  };

  // Save
  const analysisDir = path.join(projectDir, 'analysis');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.writeFileSync(path.join(analysisDir, 'suggestions.json'), JSON.stringify(result, null, 2));

  return result;
}

module.exports = {
  generateSuggestions,
  analyzeHook,
  analyzeRitmo,
  analyzeDuracao,
  analyzeEstrutura,
  analyzeEngagement,
  SUGGESTION_TYPES,
};
