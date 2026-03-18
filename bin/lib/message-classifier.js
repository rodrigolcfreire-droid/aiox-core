#!/usr/bin/env node
'use strict';

/**
 * Message Classifier — Intelligent 3-Filter Pipeline
 * [Story INTEL-1] Intelligence Classification Refinement
 *
 * Replaces naive regex matching with a 3-filter pipeline:
 *   1. Intention — Is this a real question/pain or just conversation?
 *   2. Context   — Is it related to the operation or social chatter?
 *   3. Impact    — Does it affect money, experience, or results?
 *
 * Shared between telegram-monitor.js and whatsapp-monitor.js.
 */

// ── Stop Words PT-BR ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'para', 'como', 'mais', 'isso', 'esse', 'essa', 'este', 'esta',
  'voce', 'voces', 'eles', 'elas', 'dele', 'dela', 'meus', 'minha',
  'minhas', 'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas',
  'todo', 'toda', 'todos', 'todas', 'cada', 'outro', 'outra',
  'outros', 'outras', 'mesmo', 'mesma', 'qual', 'quais',
  'quando', 'onde', 'quem', 'porque', 'pois', 'ainda', 'muito',
  'muita', 'muitos', 'muitas', 'mais', 'menos', 'tambem', 'pode',
  'podem', 'fazer', 'faz', 'feito', 'sendo', 'sido', 'seria',
  'sobre', 'entre', 'depois', 'antes', 'desde', 'aqui', 'agora',
  'algo', 'alguem', 'nada', 'ninguem', 'tudo', 'tanto', 'tanta',
  'bem', 'bom', 'boa', 'bons', 'boas', 'melhor', 'pior',
  'com', 'sem', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas',
  'que', 'mas', 'nem', 'nao', 'sim', 'tipo', 'gente',
  'ter', 'tem', 'tinha', 'tive', 'teve', 'temos', 'tenho',
  'ser', 'sou', 'era', 'foi', 'somos', 'eram',
  'estar', 'esta', 'estou', 'estava', 'estamos',
  'vai', 'vou', 'vamos', 'vem', 'veio',
  'acho', 'coisa', 'coisas', 'cara', 'galera', 'pessoal',
]);

// ── Operational Context Keywords ─────────────────────────────────
// Terms that indicate the message is about the operation (betting/platform)

const OPERATIONAL_KEYWORDS = new Set([
  // Financial
  'deposito', 'depositar', 'saque', 'sacar', 'saldo', 'dinheiro',
  'pix', 'pagamento', 'pagar', 'valor', 'real', 'reais', 'bonus',
  'cashback', 'lucro', 'lucrar', 'ganho', 'ganhei', 'ganhar',
  'investimento', 'investir', 'aposta', 'apostar', 'apostei',
  'banca', 'bankroll', 'stake', 'odd', 'odds', 'cotacao',
  // Platform
  'plataforma', 'site', 'app', 'aplicativo', 'conta', 'login',
  'cadastro', 'cadastrar', 'registro', 'registrar', 'link',
  'acesso', 'acessar', 'entrar', 'senha', 'verificacao',
  'betano', 'bet365', 'pixbet', 'realsbet', 'bingobet',
  'blaze', 'esportebet', 'betfair', 'sportingbet', 'parimatch',
  'estrela', 'estrelabet', 'novibet', 'pinnacle', 'betway',
  // Strategy/Operation
  'entrada', 'sinal', 'sinais', 'green', 'red', 'gale',
  'martingale', 'estrategia', 'metodo', 'padrao', 'analise',
  'live', 'ao vivo', 'tempo real', 'resultado', 'placar',
  'jogo', 'jogos', 'partida', 'time', 'gol', 'gols',
  'roleta', 'slot', 'slots', 'cassino', 'crash', 'mines',
  'aviator', 'spaceman', 'fortune', 'tiger', 'rabbit',
  // Experience/Journey
  'tutorial', 'como faz', 'como fazer', 'funciona', 'funcionar',
  'passo', 'etapa', 'inicio', 'comecar', 'primeiro',
  'grupo', 'comunidade', 'vip', 'premium', 'plano',
  'suporte', 'ajuda', 'atendimento', 'contato',
  'notificacao', 'alerta', 'aviso',
]);

// ── Noise Patterns (social/casual — NOT operational) ─────────────

const NOISE_PATTERNS = [
  // Greetings and small talk
  /^(oi+|ola+|hey+|eai+|fala+|salve|bom dia|boa tarde|boa noite|oii+)\b/i,
  /^(tudo bem|tudo certo|blz|tranquilo|suave|de boa)\??\s*$/i,
  // Casual reactions (short, no context)
  /^(kk+|haha+|rsrs+|kkk+|hehe+|huahua+)\s*$/i,
  /^(sim|nao|ss|nn|sss|ta|ok|blz|tmj|vlw)\s*$/i,
  // Names/mentions with no content
  /^@?\w{2,15}\s*\??\s*$/i,
  // Very short messages with just "?" (e.g., "E agr?", "Oi?", "Grafico?")
  /^[^?]{1,15}\?\s*$/i,
  // Stickers, emojis only, media references
  /^\[?(sticker|figurinha|foto|imagem|video|audio|midia)\]?\s*$/i,
];

// ── Filter 1: Intention Patterns ─────────────────────────────────
// Patterns that indicate REAL operational intent (not casual chat)

const QUESTION_INTENT_PATTERNS = [
  // "How do I..." + operational verb
  /como\s+(faz|fazer|faco|consigo|posso|devo)\s+/i,
  // "Where do I..." + operational action
  /onde\s+(faz|faco|vejo|encontro|fica|acho|consigo)\s+/i,
  // "What is..." + operational concept
  /o\s+que\s+(e|eh|significa|quer\s+dizer)\s+/i,
  // "Why..." + operational issue
  /por\s*que\s+(nao|meu|minha|o\s+meu|a\s+minha)\s+/i,
  // "Someone knows how to..."
  /alguem\s+(sabe|pode|consegue)\s+(como|me|explicar|ajudar)/i,
  // Explicit doubt
  /^duvida\s*:/i, /tenho\s+(uma\s+)?duvida/i,
  // Direct question with operational verb
  /\?\s*$/, // Only counts if it passes context filter too
];

const PAIN_INTENT_PATTERNS = [
  // "I can't" + action
  /nao\s+(consigo|consegui|funciona|funcionou|entendo|entendi|da|deu)\s+/i,
  // "I tried and..."
  /(tentei|fiz|cliquei|depositei|saquei)\s+(e|mas)\s+(nao|nada|deu)/i,
  // Technical failure
  /(travou|travando|caiu|bugou|bugando|erro|falha|falhou)\s+/i,
  /(travou|travando|caiu|bugou|bugando|erro|falha|falhou)\s*$/i,
  // "Doesn't work"
  /nao\s+(da|deu)\s+certo/i, /nao\s+esta\s+funcionando/i,
  // Financial loss with context
  /perdi\s+(tudo|minha banca|meu saldo|meu dinheiro|todo)/i,
  /perdendo\s+(tudo|muito|demais|dinheiro)/i,
  // Explicit frustration with operational context
  /nao\s+recebi\s+(o|meu|minha)\s+(saque|deposito|bonus|dinheiro|pix)/i,
  // Access problems
  /nao\s+(abre|abriu|carrega|carregou|entra|entrou|aparece|apareceu)/i,
];

// ── Filter 2: Context Checker ────────────────────────────────────

/**
 * Checks if a message has operational context.
 * Returns true if the message contains at least one operational keyword.
 */
function hasOperationalContext(text) {
  const lower = text.toLowerCase();
  const words = lower
    .replace(/[^a-záàâãéèêíïóôõúüç\s]/g, ' ')
    .split(/\s+/);

  for (const word of words) {
    if (OPERATIONAL_KEYWORDS.has(word)) return true;
  }

  // Also check 2-word operational phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i] + ' ' + words[i + 1];
    if (OPERATIONAL_KEYWORDS.has(phrase)) return true;
  }

  return false;
}

// ── Filter 3: Impact Assessment ──────────────────────────────────

/**
 * Checks if a message indicates real impact (money, experience, results).
 * Messages that pass intent + context but have no impact are downgraded.
 */
function hasImpact(text) {
  const lower = text.toLowerCase();

  const impactPatterns = [
    // Money impact
    /dinheiro|saldo|banca|deposito|saque|pix|valor|real|reais|lucro|prejuizo/i,
    // Action impact (user tried to do something)
    /tentei|fiz|cliquei|depositei|saquei|cadastrei|acessei|entrei/i,
    // Result impact
    /resultado|ganhe|perdi|funciono|nao\s+(deu|funciono|abri)/i,
    // Experience impact
    /nao\s+(consigo|entendo|sei\s+como)/i,
    /preciso\s+(de\s+ajuda|saber|entender)/i,
    // Platform impact
    /plataforma|site|app|link|conta|login|cadastro/i,
    // Strategy impact
    /entrada|sinal|estrategia|metodo|\bgreen\b|\bred\b|\bgale\b/i,
  ];

  return impactPatterns.some(p => p.test(lower));
}

// ── Noise Filter ─────────────────────────────────────────────────

function isNoise(text) {
  const lower = (text || '').trim().toLowerCase();

  // Empty or very short
  if (lower.length < 3) return true;

  // Matches noise pattern
  if (NOISE_PATTERNS.some(p => p.test(lower))) return true;

  return false;
}

// ── Engagement Patterns (kept from original — less strict) ───────

const ENGAGEMENT_PATTERNS = [
  /kkkk/i, /hahaha/i, /rsrs/i,
  /top\s*demais/i, /sensacional/i, /incrivel/i, /show/i,
  /concordo/i, /exatamente/i, /isso\s+mesmo/i,
  /obrigad[oa]/i, /valeu/i, /brigad/i,
  /compartilh/i, /recomend/i,
  /monstro/i, /brabo/i, /fera/i, /craque/i,
];

// ── Main Classifier ──────────────────────────────────────────────

/**
 * Classifies a message using the 3-filter pipeline.
 *
 * Pipeline:
 *   1. NOISE CHECK → If noise, return ['geral']
 *   2. INTENTION   → Does the message express a real question/pain?
 *   3. CONTEXT     → Is it related to the operation?
 *   4. IMPACT      → Does it affect money, experience, or results?
 *
 * A message is classified as 'duvida' or 'dor' ONLY if it passes
 * all 3 filters. Otherwise it falls to 'engajamento' or 'geral'.
 *
 * @param {string} text - The message text
 * @returns {string[]} Array of tags
 */
function classifyMessage(text) {
  const lower = (text || '').toLowerCase().trim();
  const tags = [];

  // Skip noise
  if (isNoise(lower)) {
    if (lower.length > 200) tags.push('mensagem_longa');
    if (/https?:\/\//i.test(lower)) tags.push('link');
    if (tags.length === 0) tags.push('geral');
    return tags;
  }

  // ── Filter 1+2+3: Duvida (Question) ─────────────────────────
  const hasQuestionIntent = QUESTION_INTENT_PATTERNS.some(p => p.test(lower));
  if (hasQuestionIntent) {
    const hasContext = hasOperationalContext(lower);
    const msgHasImpact = hasImpact(lower);
    // Needs context OR impact (some questions are self-evident)
    if (hasContext || msgHasImpact) {
      tags.push('duvida');
    }
  }

  // ── Filter 1+2+3: Dor (Pain) ────────────────────────────────
  const hasPainIntent = PAIN_INTENT_PATTERNS.some(p => p.test(lower));
  if (hasPainIntent) {
    const hasContext = hasOperationalContext(lower);
    const msgHasImpact = hasImpact(lower);
    // Pain needs BOTH context and impact to qualify
    if (hasContext && msgHasImpact) {
      tags.push('dor');
    }
  }

  // ── Engagement (less strict — kept for sentiment tracking) ───
  const isEngagement = ENGAGEMENT_PATTERNS.some(p => p.test(lower));
  if (isEngagement) tags.push('engajamento');

  // ── Meta tags ────────────────────────────────────────────────
  if (lower.length > 200) tags.push('mensagem_longa');
  if (/https?:\/\//i.test(lower)) tags.push('link');

  if (tags.length === 0) tags.push('geral');
  return tags;
}

// ── Content Suggestions (Pattern-Based) ──────────────────────────

const MIN_PATTERN_THRESHOLD = 5;
const SUGGESTION_THRESHOLD = 15;

/**
 * Generates content suggestions ONLY from validated patterns.
 * Suggestions require minimum occurrence thresholds.
 *
 * @param {object} analysis - The analysis object with questions, pains, topics, viral
 * @returns {object[]} Array of suggestion objects
 */
function suggestContent(analysis) {
  const suggestions = [];

  // From questions — only if recurring (threshold: 5+)
  if (analysis.questions && analysis.questions.length > 0) {
    analysis.questions
      .filter(q => q.count >= MIN_PATTERN_THRESHOLD)
      .slice(0, 5)
      .forEach(q => {
        suggestions.push({
          type: 'conteudo',
          source: 'duvida_recorrente',
          suggestion: `Tutorial/video respondendo: "${q.text.slice(0, 80)}"`,
          priority: q.count >= SUGGESTION_THRESHOLD ? 'high' : 'medium',
          format: 'video_curto',
          occurrences: q.count,
        });
      });
  }

  // From pains — only if recurring (threshold: 5+)
  if (analysis.pains && analysis.pains.length > 0) {
    analysis.pains
      .filter(p => p.count >= MIN_PATTERN_THRESHOLD)
      .slice(0, 3)
      .forEach(p => {
        suggestions.push({
          type: 'roteiro',
          source: 'dor_da_audiencia',
          suggestion: `Roteiro abordando dor: "${p.text.slice(0, 80)}"`,
          priority: p.count >= SUGGESTION_THRESHOLD ? 'critical' : 'high',
          format: 'video_longo',
          occurrences: p.count,
        });
      });
  }

  // From trending topics — only high-frequency
  if (analysis.topics && analysis.topics.bigrams && analysis.topics.bigrams.length > 0) {
    analysis.topics.bigrams
      .filter(([, count]) => count >= 10)
      .slice(0, 3)
      .forEach(([topic, count]) => {
        suggestions.push({
          type: 'conteudo',
          source: 'tema_trending',
          suggestion: `Conteudo sobre: "${topic}" (${count} mencoes)`,
          priority: count >= SUGGESTION_THRESHOLD ? 'high' : 'medium',
          format: 'post_ou_video',
          occurrences: count,
        });
      });
  }

  // From viral topics — keep as-is (already threshold-filtered)
  if (analysis.viral && analysis.viral.length > 0) {
    analysis.viral.forEach(v => {
      suggestions.push({
        type: 'anuncio',
        source: 'tema_viral',
        suggestion: `Anuncio baseado em tema viral: "${v.topic}" (velocidade ${v.velocity}x)`,
        priority: 'high',
        format: 'criativo_pago',
      });
    });
  }

  return suggestions;
}

// ── Exports ──────────────────────────────────────────────────────

module.exports = {
  STOP_WORDS,
  OPERATIONAL_KEYWORDS,
  ENGAGEMENT_PATTERNS,
  classifyMessage,
  suggestContent,
  hasOperationalContext,
  hasImpact,
  isNoise,
  MIN_PATTERN_THRESHOLD,
  SUGGESTION_THRESHOLD,
};
