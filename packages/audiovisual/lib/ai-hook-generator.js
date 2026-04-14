#!/usr/bin/env node
'use strict';

/**
 * ai-hook-generator.js — Generate hook/CTA copy suggestions via OpenAI Chat Completions.
 * Story: EM-2 (Fase 3)
 *
 * NO video generation — text copy only. User records the hook/CTA themselves.
 */

const https = require('https');
const path = require('path');
const { loadEnv } = require(path.resolve(__dirname, 'transcribe'));

const SYSTEM_PROMPTS = {
  hook: `Você é um copywriter viral especialista em primeiros 3 segundos de vídeo curto (Reels, TikTok, Shorts).
Sua tarefa: gerar HOOKS (frases de abertura) que prendem atenção imediata.
REGRAS:
- Cada hook tem NO MÁXIMO 8 palavras
- Português brasileiro, tom natural e direto
- Use padrões comprovados: pergunta provocativa, dado chocante, contraste, negação, comando
- Zero clichês ("olha só", "galera")
- Variar estilos entre as opções
Retorne APENAS um JSON array de strings. Exemplo: ["Ninguém te conta isso.","Você está fazendo errado."]`,
  cta: `Você é um copywriter especialista em CALL-TO-ACTION (CTA) finais de vídeo.
Sua tarefa: gerar CTAs curtos e eficazes pro final do vídeo.
REGRAS:
- Cada CTA tem NO MÁXIMO 10 palavras
- Português brasileiro, imperativo
- Variar entre: comentar, seguir, salvar, compartilhar, link na bio, curtir
- Natural, não robótico
Retorne APENAS um JSON array de strings.`,
};

/**
 * Generate N suggestions via OpenAI.
 * @param {string} type - 'hook' or 'cta'
 * @param {string} theme - Context/theme to guide generation
 * @param {number} count - Number of suggestions (default 5)
 * @returns {Promise<string[]>}
 */
function generateSuggestions({ type, theme, count = 5 }) {
  if (!['hook', 'cta'].includes(type)) throw new Error(`Invalid type "${type}". Use 'hook' or 'cta'.`);
  if (!theme || typeof theme !== 'string') throw new Error('theme is required');

  const env = loadEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not found in .env');

  const system = SYSTEM_PROMPTS[type];
  const user = `Tema/contexto: "${theme}"\nQuantidade: ${count}\nGere ${count} ${type}s distintos.`;

  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.9,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  // gpt-4o-mini with json_object needs the user to mention "json" — add wrapper
  const bodyWrapped = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system + '\n\nResponda SEMPRE como JSON: {"items":[...]}' },
      { role: 'user', content: user + '\n\nResponda como JSON com a chave "items".' },
    ],
    temperature: 0.9,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyWrapped),
      },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`OpenAI ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || '{}';
          const payload = JSON.parse(content);
          const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
          resolve(items.map(s => String(s).trim()).filter(Boolean));
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('OpenAI request timeout')); });
    req.write(bodyWrapped);
    req.end();
  });
}

/**
 * Given a mix's top-rated hook (from ranking), suggest variations.
 */
async function suggestFromTop({ mixId, kind = 'hook', count = 5 }) {
  const store = require(path.resolve(__dirname, 'escala-mix-store'));
  const ranking = store.getRanking(mixId);
  const poolKind = kind === 'hook' ? 'hooks' : 'ctas';
  const top = ranking[poolKind]?.[0];
  if (!top) throw new Error(`No rated ${kind} yet — avalie pelo menos 1 render primeiro.`);
  return generateSuggestions({ type: kind, theme: top.name, count });
}

module.exports = { generateSuggestions, suggestFromTop };
