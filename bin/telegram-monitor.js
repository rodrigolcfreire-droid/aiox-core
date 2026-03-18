#!/usr/bin/env node
'use strict';

/**
 * telegram-monitor.js — CLI para Squad Telegram Intelligence
 *
 * Comandos:
 *   node bin/telegram-monitor.js status                Verifica status de todos os bots
 *   node bin/telegram-monitor.js listen [agent]        Escuta mensagens (all ou agent especifico)
 *   node bin/telegram-monitor.js report [agent]        Gera relatorio basico
 *   node bin/telegram-monitor.js analyze [agent]       Analise inteligente completa
 *   node bin/telegram-monitor.js sync [agent]          Sincroniza dados com Supabase
 *   node bin/telegram-monitor.js export [agent]        Gera relatorio HTML (download/PDF)
 *   node bin/telegram-monitor.js notify [agent]        Envia relatorio ao operador via Telegram
 *   node bin/telegram-monitor.js groups                Lista grupos de cada bot
 *   node bin/telegram-monitor.js setup-notify          Configura chat_id do operador
 *   node bin/telegram-monitor.js pipeline              Executa pipeline completo (listen+analyze+notify)
 *   node bin/telegram-monitor.js cron-install           Instala agendamento diario (8h)
 *   node bin/telegram-monitor.js cron-remove            Remove agendamento diario
 *   node bin/telegram-monitor.js cron-status            Verifica status do agendamento
 *   node bin/telegram-monitor.js import <json> <agent>  Importa historico do Telegram Desktop
 *
 * CLI First: Este script e a fonte da verdade para monitoramento Telegram.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const {
  STOP_WORDS, classifyMessage, suggestContent,
} = require('./lib/message-classifier');

// ── Config ──────────────────────────────────────────────────────
const ENV_PATH = path.resolve(__dirname, '..', '.env');
const DATA_DIR = path.resolve(__dirname, '..', '.aiox', 'telegram');
const REPORTS_DIR = path.resolve(__dirname, '..', 'docs', 'examples', 'ux-command-center', 'reports');
const NOTIFY_CONFIG_PATH = path.join(DATA_DIR, 'notify-config.json');

const AGENTS = {
  professor: {
    name: 'Professor',
    envKey: 'TELEGRAM_BOT_PROFESSOR',
    botUsername: 'OPROFESSORTetris_bot',
  },
  suhaviator: {
    name: 'Suhaviator',
    envKey: 'TELEGRAM_BOT_SUHAVIATOR',
    botUsername: 'suhaviatorTetris_bot',
  },
  'caio-roleta': {
    name: 'Caio Roleta',
    envKey: 'TELEGRAM_BOT_CAIO_ROLETA',
    botUsername: 'caioroletaTetris_bot',
  },
  iristhaize: {
    name: 'Iristhaize',
    envKey: 'TELEGRAM_BOT_IRISTHAIZE',
    botUsername: 'iristhaizeTetris_bot',
  },
};

// ── Helpers ─────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    });
  } catch (err) {
    console.error('Erro ao ler .env:', err.message);
    process.exit(1);
  }
  return env;
}

function getToken(env, agentId) {
  const agent = AGENTS[agentId];
  if (!agent) return null;
  return env[agent.envKey] || null;
}

function telegramApi(token, method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    https.get(url.toString(), res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (_e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveMessages(agentId, messages) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${agentId}-messages.json`);
  let existing = [];
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_e) {
      existing = [];
    }
  }
  const existingIds = new Set(existing.map(m => m.message_id));
  const newMessages = messages.filter(m => !existingIds.has(m.message_id));
  const merged = [...existing, ...newMessages].sort((a, b) => a.date - b.date);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  return newMessages.length;
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// ── Commands ────────────────────────────────────────────────────

async function cmdStatus() {
  const env = loadEnv();
  console.log('\n  SQUAD TELEGRAM INTELLIGENCE — Status dos Bots\n');
  console.log('  ' + '-'.repeat(60));

  for (const [id, agent] of Object.entries(AGENTS)) {
    const token = getToken(env, id);
    if (!token) {
      console.log(`  ${agent.name.padEnd(15)} | Token: NAO CONFIGURADO`);
      continue;
    }

    try {
      const result = await telegramApi(token, 'getMe');
      if (result.ok) {
        const bot = result.result;
        console.log(`  ${agent.name.padEnd(15)} | @${bot.username} | ID: ${bot.id} | OK`);
      } else {
        console.log(`  ${agent.name.padEnd(15)} | ERRO: ${result.description || 'Unknown'}`);
      }
    } catch (err) {
      console.log(`  ${agent.name.padEnd(15)} | ERRO: ${err.message}`);
    }
  }

  console.log('  ' + '-'.repeat(60));
  console.log('');
}

async function cmdGroups() {
  const env = loadEnv();
  console.log('\n  SQUAD TELEGRAM — Grupos dos Bots\n');

  for (const [id, agent] of Object.entries(AGENTS)) {
    const token = getToken(env, id);
    if (!token) {
      console.log(`  ${agent.name}: Token nao configurado`);
      continue;
    }

    try {
      const result = await telegramApi(token, 'getUpdates', { limit: 100 });
      if (!result.ok) {
        console.log(`  ${agent.name}: Erro — ${result.description}`);
        continue;
      }

      const chats = new Map();
      (result.result || []).forEach(update => {
        const msg = update.message || update.channel_post;
        if (msg && msg.chat) {
          const c = msg.chat;
          if (c.type === 'group' || c.type === 'supergroup' || c.type === 'channel') {
            chats.set(c.id, { id: c.id, title: c.title || 'Sem titulo', type: c.type });
          }
        }
      });

      if (chats.size === 0) {
        console.log(`  ${agent.name}: Nenhum grupo detectado`);
        console.log(`    Adicione @${agent.botUsername} ao grupo do Expert e envie uma mensagem.`);
      } else {
        console.log(`  ${agent.name}: ${chats.size} grupo(s)`);
        chats.forEach(chat => {
          console.log(`    - ${chat.title} (ID: ${chat.id}, ${chat.type})`);
        });
      }
    } catch (err) {
      console.log(`  ${agent.name}: Erro — ${err.message}`);
    }
    console.log('');
  }
}

async function cmdListen(agentFilter) {
  const env = loadEnv();
  const agents = agentFilter === 'all'
    ? Object.keys(AGENTS)
    : [agentFilter];

  for (const id of agents) {
    if (!AGENTS[id]) {
      console.log(`  Agente desconhecido: ${id}`);
      console.log(`  Disponiveis: ${Object.keys(AGENTS).join(', ')}`);
      continue;
    }

    const token = getToken(env, id);
    if (!token) {
      console.log(`  ${AGENTS[id].name}: Token nao configurado`);
      continue;
    }

    console.log(`\n  Coletando mensagens de ${AGENTS[id].name}...`);

    try {
      const allMessages = [];
      let offset = 0;
      let page = 0;
      const MAX_PAGES = 50; // Safety limit: 50 * 100 = 5000 messages max

      while (page < MAX_PAGES) {
        const params = { limit: 100 };
        if (offset > 0) params.offset = offset;

        const result = await telegramApi(token, 'getUpdates', params);
        if (!result.ok) {
          console.log(`  Erro: ${result.description}`);
          break;
        }

        const updates = result.result || [];
        if (updates.length === 0) break;

        const messages = updates
          .filter(u => u.message && u.message.text)
          .map(u => ({
            message_id: u.message.message_id,
            date: u.message.date,
            from: u.message.from
              ? `${u.message.from.first_name || ''} ${u.message.from.last_name || ''}`.trim()
              : 'Desconhecido',
            from_id: u.message.from ? u.message.from.id : null,
            chat_id: u.message.chat.id,
            chat_title: u.message.chat.title || 'DM',
            text: u.message.text,
          }));

        allMessages.push(...messages);

        // Move offset to after the last update_id to get next page
        const lastUpdateId = updates[updates.length - 1].update_id;
        offset = lastUpdateId + 1;
        page++;

        // If we got less than 100 updates, no more pages
        if (updates.length < 100) break;

        if (page > 1) {
          process.stdout.write(`  Pagina ${page}: +${messages.length} mensagens\r`);
        }
      }

      const newCount = saveMessages(id, allMessages);
      console.log(`  ${allMessages.length} mensagens encontradas, ${newCount} novas salvas${page > 1 ? ` (${page} paginas)` : ''}`);

      if (allMessages.length > 0) {
        console.log('  Ultimas 5 mensagens:');
        allMessages.slice(-5).forEach(m => {
          console.log(`    [${formatDate(m.date)}] ${m.from}: ${m.text.slice(0, 80)}`);
        });
      }
    } catch (err) {
      console.log(`  Erro: ${err.message}`);
    }
  }
  console.log('');
}

async function cmdReport(agentId) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${agentId}-messages.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`  Nenhuma mensagem coletada para ${AGENTS[agentId]?.name || agentId}`);
    console.log(`  Execute primeiro: node bin/telegram-monitor.js listen ${agentId}`);
    return;
  }

  const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const agent = AGENTS[agentId];

  console.log(`\n  RELATORIO — ${agent.name}\n`);
  console.log(`  Total de mensagens: ${messages.length}`);

  if (messages.length === 0) {
    console.log('  Sem dados suficientes para analise.');
    return;
  }

  // Analise basica
  const users = new Map();
  const hourCounts = new Array(24).fill(0);
  const wordFreq = new Map();

  messages.forEach(m => {
    // Contagem por usuario
    const userId = m.from_id || m.from;
    if (!users.has(userId)) {
      users.set(userId, { name: m.from, count: 0 });
    }
    users.get(userId).count++;

    // Horarios
    const hour = new Date(m.date * 1000).getHours();
    hourCounts[hour]++;

    // Palavras frequentes (ignorar curtas)
    const words = (m.text || '').toLowerCase().split(/\s+/);
    words.forEach(w => {
      const clean = w.replace(/[^a-zA-ZáàâãéèêíïóôõúüçÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/g, '');
      if (clean.length > 3) {
        wordFreq.set(clean, (wordFreq.get(clean) || 0) + 1);
      }
    });
  });

  // Top usuarios
  const topUsers = [...users.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  console.log('\n  Top usuarios mais ativos:');
  topUsers.forEach((u, i) => {
    console.log(`    ${i + 1}. ${u.name} — ${u.count} mensagens`);
  });

  // Horarios de pico
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  console.log(`\n  Horario de pico: ${peakHour}h (${hourCounts[peakHour]} mensagens)`);

  // Top palavras
  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log('\n  Palavras mais frequentes:');
  topWords.forEach(([word, count]) => {
    console.log(`    ${word}: ${count}x`);
  });

  // Salvar relatorio
  const reportData = {
    agent: agentId,
    generated_at: new Date().toISOString(),
    total_messages: messages.length,
    top_users: topUsers,
    peak_hour: peakHour,
    hour_distribution: hourCounts,
    top_words: topWords.map(([word, count]) => ({ word, count })),
  };

  const reportPath = path.join(DATA_DIR, `${agentId}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n  Relatorio salvo em: ${reportPath}`);
  console.log('');
}

// ── Intelligence Analysis ───────────────────────────────────────
// Classification logic is in bin/lib/message-classifier.js (shared module)
// Imports: STOP_WORDS, classifyMessage, suggestContent, hasOperationalContext

function extractTopics(messages) {
  // Bigram extraction for topic detection
  const bigrams = new Map();
  const trigrams = new Map();

  messages.forEach(m => {
    const words = (m.text || '').toLowerCase()
      .replace(/[^a-záàâãéèêíïóôõúüç\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    for (let i = 0; i < words.length - 1; i++) {
      const bi = words[i] + ' ' + words[i + 1];
      bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
      if (i < words.length - 2) {
        const tri = bi + ' ' + words[i + 2];
        trigrams.set(tri, (trigrams.get(tri) || 0) + 1);
      }
    }
  });

  const topBigrams = [...bigrams.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const topTrigrams = [...trigrams.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return { bigrams: topBigrams, trigrams: topTrigrams };
}

function detectInfluencers(messages) {
  const userStats = new Map();

  messages.forEach(m => {
    const uid = m.from_id || m.from;
    if (!userStats.has(uid)) {
      userStats.set(uid, {
        name: m.from,
        user_id: m.from_id,
        count: 0,
        engagement_received: 0,
        long_messages: 0,
        links_shared: 0,
      });
    }
    const u = userStats.get(uid);
    u.count++;
    if ((m.text || '').length > 200) u.long_messages++;
    if (/https?:\/\//i.test(m.text || '')) u.links_shared++;
  });

  return [...userStats.values()]
    .map(u => {
      // Score: messages * 1 + long_messages * 2 + links * 1.5
      u.score = u.count + (u.long_messages * 2) + (u.links_shared * 1.5);
      u.level = u.score >= 50 ? 'high' : u.score >= 20 ? 'medium' : 'low';
      return u;
    })
    .sort((a, b) => b.score - a.score);
}

function segmentUsers(messages) {
  const userStats = new Map();

  messages.forEach(m => {
    const uid = m.from_id || m.from;
    if (!userStats.has(uid)) {
      userStats.set(uid, {
        name: m.from,
        user_id: m.from_id,
        count: 0,
        questions: 0,
        helpful_answers: 0,
        topics: new Set(),
      });
    }
    const u = userStats.get(uid);
    u.count++;
    const tags = classifyMessage(m.text);
    if (tags.includes('duvida')) u.questions++;
    if (tags.includes('engajamento') && (m.text || '').length > 100) u.helpful_answers++;
  });

  return [...userStats.values()].map(u => {
    const qRatio = u.count > 0 ? u.questions / u.count : 0;
    // High question ratio + low count = iniciante
    // Low question ratio + high count + helpful = avancado
    if (u.count >= 10 && qRatio < 0.3 && u.helpful_answers >= 2) {
      u.segment = 'avancado';
      u.confidence = 0.7 + Math.min(u.count / 100, 0.25);
    } else if (qRatio > 0.5 || u.count < 5) {
      u.segment = 'iniciante';
      u.confidence = 0.5 + (qRatio * 0.3);
    } else {
      u.segment = 'intermediario';
      u.confidence = 0.5;
    }
    return u;
  });
}

function detectViralTopics(messages) {
  // Detect bursts of activity around specific words/phrases
  const timeWindows = new Map(); // 1-hour windows

  messages.forEach(m => {
    const hour = Math.floor(m.date / 3600) * 3600;
    if (!timeWindows.has(hour)) timeWindows.set(hour, []);
    timeWindows.get(hour).push(m);
  });

  const windowCounts = [...timeWindows.entries()]
    .map(([ts, msgs]) => ({ ts, count: msgs.length, messages: msgs }))
    .sort((a, b) => b.count - a.count);

  // Windows with 3x+ avg activity = viral
  const avgPerWindow = messages.length / Math.max(timeWindows.size, 1);
  const viralWindows = windowCounts.filter(w => w.count >= avgPerWindow * 3 && w.count >= 5);

  return viralWindows.map(w => {
    const wordFreq = new Map();
    w.messages.forEach(m => {
      (m.text || '').toLowerCase().split(/\s+/)
        .filter(word => word.length > 4 && !STOP_WORDS.has(word))
        .forEach(word => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
    });
    const topWord = [...wordFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      timestamp: new Date(w.ts * 1000).toISOString(),
      message_count: w.count,
      topic: topWord ? topWord[0] : 'desconhecido',
      velocity: (w.count / avgPerWindow).toFixed(2),
    };
  });
}

// suggestContent() imported from bin/lib/message-classifier.js

async function cmdAnalyze(agentFilter) {
  ensureDataDir();
  const agents = agentFilter === 'all' ? Object.keys(AGENTS) : [agentFilter];

  for (const id of agents) {
    if (!AGENTS[id]) {
      console.log(`  Agente desconhecido: ${id}`);
      continue;
    }

    const filePath = path.join(DATA_DIR, `${id}-messages.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${AGENTS[id].name}: Sem mensagens. Execute: listen ${id}`);
      continue;
    }

    const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (messages.length === 0) {
      console.log(`  ${AGENTS[id].name}: 0 mensagens para analise.`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ANALISE INTELIGENTE — ${AGENTS[id].name}`);
    console.log(`  ${messages.length} mensagens analisadas`);
    console.log(`${'='.repeat(60)}`);

    // 1. Classify all messages
    const classified = messages.map(m => ({
      ...m,
      tags: classifyMessage(m.text),
    }));

    const questions = classified.filter(m => m.tags.includes('duvida'));
    const pains = classified.filter(m => m.tags.includes('dor'));
    const engagements = classified.filter(m => m.tags.includes('engajamento'));

    console.log('\n  CLASSIFICACAO');
    console.log(`    Duvidas:     ${questions.length} (${(questions.length / messages.length * 100).toFixed(1)}%)`);
    console.log(`    Dores:       ${pains.length} (${(pains.length / messages.length * 100).toFixed(1)}%)`);
    console.log(`    Engajamento: ${engagements.length} (${(engagements.length / messages.length * 100).toFixed(1)}%)`);

    // 2. Topics
    const topics = extractTopics(messages);
    console.log('\n  TOPICOS MAIS DISCUTIDOS');
    topics.bigrams.slice(0, 10).forEach(([topic, count]) => {
      console.log(`    ${topic}: ${count}x`);
    });

    // 3. Questions
    console.log('\n  DUVIDAS RECORRENTES');
    // Group similar questions
    const qMap = new Map();
    questions.forEach(q => {
      const key = q.text.slice(0, 60).toLowerCase();
      if (!qMap.has(key)) qMap.set(key, { text: q.text, count: 0 });
      qMap.get(key).count++;
    });
    const topQ = [...qMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    topQ.forEach(q => {
      console.log(`    [${q.count}x] ${q.text.slice(0, 100)}`);
    });

    // 4. Pains
    console.log('\n  DORES DA AUDIENCIA');
    const pMap = new Map();
    pains.forEach(p => {
      const key = p.text.slice(0, 60).toLowerCase();
      if (!pMap.has(key)) pMap.set(key, { text: p.text, count: 0 });
      pMap.get(key).count++;
    });
    const topP = [...pMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    topP.forEach(p => {
      console.log(`    [${p.count}x] ${p.text.slice(0, 100)}`);
    });

    // 5. Influencers
    const influencers = detectInfluencers(messages);
    console.log('\n  INFLUENCIADORES');
    influencers.slice(0, 5).forEach((u, i) => {
      console.log(`    ${i + 1}. ${u.name} — ${u.count} msgs, score ${u.score.toFixed(1)} [${u.level}]`);
    });

    // 6. Segments
    const segments = segmentUsers(messages);
    const iniciantes = segments.filter(s => s.segment === 'iniciante');
    const avancados = segments.filter(s => s.segment === 'avancado');
    const intermediarios = segments.filter(s => s.segment === 'intermediario');
    console.log('\n  SEGMENTACAO DE USUARIOS');
    console.log(`    Iniciantes:     ${iniciantes.length}`);
    console.log(`    Intermediarios: ${intermediarios.length}`);
    console.log(`    Avancados:      ${avancados.length}`);

    // 7. Viral topics
    const viral = detectViralTopics(messages);
    if (viral.length > 0) {
      console.log('\n  TEMAS VIRAIS DETECTADOS');
      viral.forEach(v => {
        console.log(`    ${v.topic} — ${v.message_count} msgs, velocidade ${v.velocity}x (${v.timestamp})`);
      });
    }

    // 8. Activity hours
    const hourCounts = new Array(24).fill(0);
    messages.forEach(m => {
      const hour = new Date(m.date * 1000).getHours();
      hourCounts[hour]++;
    });
    const _peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const top3Hours = hourCounts
      .map((c, h) => ({ hour: h, count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    console.log('\n  HORARIOS DE PICO');
    top3Hours.forEach(h => {
      console.log(`    ${h.hour}h: ${h.count} mensagens`);
    });

    // 9. Content suggestions
    const analysis = {
      questions: topQ,
      pains: topP,
      topics,
      viral,
      influencers: influencers.slice(0, 10),
      segments: { iniciantes: iniciantes.length, intermediarios: intermediarios.length, avancados: avancados.length },
      peak_hours: top3Hours,
    };
    const suggestions = suggestContent(analysis);

    if (suggestions.length > 0) {
      console.log('\n  SUGESTOES DE CONTEUDO');
      suggestions.forEach((s, _i) => {
        const pIcon = s.priority === 'high' ? '[!!!]' : '[ ! ]';
        console.log(`    ${pIcon} [${s.type}] ${s.suggestion}`);
      });
    }

    // Save full analysis
    const fullAnalysis = {
      agent: id,
      agent_name: AGENTS[id].name,
      generated_at: new Date().toISOString(),
      total_messages: messages.length,
      classification: {
        duvidas: questions.length,
        dores: pains.length,
        engajamento: engagements.length,
      },
      top_questions: topQ,
      top_pains: topP,
      topics: {
        bigrams: topics.bigrams.map(([t, c]) => ({ topic: t, count: c })),
        trigrams: topics.trigrams.map(([t, c]) => ({ topic: t, count: c })),
      },
      influencers: influencers.slice(0, 15).map(u => ({
        name: u.name,
        user_id: u.user_id,
        messages: u.count,
        score: u.score,
        level: u.level,
      })),
      segments: {
        iniciantes: iniciantes.length,
        intermediarios: intermediarios.length,
        avancados: avancados.length,
      },
      viral_topics: viral,
      peak_hours: top3Hours,
      content_suggestions: suggestions,
      hour_distribution: hourCounts,
    };

    const analysisPath = path.join(DATA_DIR, `${id}-analysis.json`);
    fs.writeFileSync(analysisPath, JSON.stringify(fullAnalysis, null, 2));
    console.log(`\n  Analise salva em: ${analysisPath}`);
    console.log('');
  }
}

// ── Sync to Supabase ────────────────────────────────────────────

function getDbClient() {
  const env = loadEnv();
  const dbUrl = env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('  SUPABASE_DB_URL nao configurada no .env');
    return null;
  }

  let pg;
  try {
    pg = require('pg');
  } catch (_e) {
    console.error('  Modulo "pg" nao encontrado. Execute: npm install pg --no-save');
    return null;
  }

  const url = new URL(dbUrl);
  return new pg.Client({
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1) || 'postgres',
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
  });
}

async function cmdSync(agentFilter) {
  const agents = agentFilter === 'all' ? Object.keys(AGENTS) : [agentFilter];
  const client = getDbClient();
  if (!client) return;

  try {
    await client.connect();
    console.log('\n  Conectado ao Supabase. Sincronizando dados...\n');

    for (const id of agents) {
      if (!AGENTS[id]) continue;

      // Sync messages
      const msgPath = path.join(DATA_DIR, `${id}-messages.json`);
      if (fs.existsSync(msgPath)) {
        const messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
        let synced = 0;
        for (const m of messages) {
          try {
            await client.query(`
              INSERT INTO telegram.messages (agent_id, chat_id, chat_title, message_id, from_id, from_name, text, date)
              VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
              ON CONFLICT (agent_id, chat_id, message_id) DO NOTHING
            `, [id, m.chat_id, m.chat_title, m.message_id, m.from_id, m.from, m.text, m.date]);
            synced++;
          } catch (_e) { /* skip duplicates */ }
        }
        console.log(`  ${AGENTS[id].name}: ${synced} mensagens sincronizadas`);
      }

      // Sync analysis
      const analysisPath = path.join(DATA_DIR, `${id}-analysis.json`);
      if (fs.existsSync(analysisPath)) {
        const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

        // Sync topics
        for (const t of (analysis.topics?.bigrams || [])) {
          await client.query(`
            INSERT INTO telegram.topics (agent_id, topic, frequency, category)
            VALUES ($1, $2, $3, 'bigram')
            ON CONFLICT DO NOTHING
          `, [id, t.topic, t.count]).catch(() => {});
        }

        // Sync pains
        for (const p of (analysis.top_pains || [])) {
          await client.query(`
            INSERT INTO telegram.pains (agent_id, pain, frequency, example_message)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [id, p.text.slice(0, 200), p.count, p.text]).catch(() => {});
        }

        // Sync questions
        for (const q of (analysis.top_questions || [])) {
          await client.query(`
            INSERT INTO telegram.questions (agent_id, question, frequency, example_message)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [id, q.text.slice(0, 200), q.count, q.text]).catch(() => {});
        }

        // Sync influencers
        for (const inf of (analysis.influencers || [])) {
          await client.query(`
            INSERT INTO telegram.influencers (agent_id, user_id, user_name, message_count, engagement_score, influence_level)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (agent_id, user_id) DO UPDATE SET
              message_count = $4, engagement_score = $5, influence_level = $6, updated_at = now()
          `, [id, inf.user_id || 0, inf.name, inf.messages, inf.score, inf.level]).catch(() => {});
        }

        // Sync content suggestions
        for (const s of (analysis.content_suggestions || [])) {
          await client.query(`
            INSERT INTO telegram.content_opportunities (agent_id, opportunity, type, priority, suggested_format, suggested_angle)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [id, s.suggestion, s.type, s.priority, s.format, s.source]).catch(() => {});
        }

        // Sync report
        await client.query(`
          INSERT INTO telegram.reports (agent_id, report_type, summary, data_json)
          VALUES ($1, 'analise', $2, $3)
        `, [id, `Analise de ${analysis.total_messages} mensagens`, JSON.stringify(analysis)]).catch(() => {});

        // Sync activity hours
        for (let h = 0; h < 24; h++) {
          if (analysis.hour_distribution && analysis.hour_distribution[h] > 0) {
            await client.query(`
              INSERT INTO telegram.activity_hours (agent_id, day_of_week, hour, message_count)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (agent_id, day_of_week, hour, period) DO UPDATE SET
                message_count = $4, updated_at = now()
            `, [id, new Date().getDay(), h, analysis.hour_distribution[h]]).catch(() => {});
          }
        }

        // Sync viral topics
        for (const v of (analysis.viral_topics || [])) {
          await client.query(`
            INSERT INTO telegram.viral_topics (agent_id, topic, velocity, peak_messages, detected_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [id, v.topic, parseFloat(v.velocity), v.message_count, v.timestamp]).catch(() => {});
        }

        console.log(`  ${AGENTS[id].name}: analise sincronizada (topics, pains, questions, influencers, suggestions)`);
      }
    }

    console.log('\n  Sync concluido.\n');
  } catch (err) {
    console.error('  Erro de conexao:', err.message);
  } finally {
    await client.end();
  }
}

// ── Export HTML Report (printable as PDF) ───────────────────────

function generateReportHtml(agentId, analysis) {
  const agent = AGENTS[agentId];
  const date = new Date().toLocaleDateString('pt-BR');
  const time = new Date().toLocaleTimeString('pt-BR');

  const topicsHtml = (analysis.topics?.bigrams || [])
    .slice(0, 10)
    .map(t => `<tr><td>${t.topic}</td><td>${t.count}</td></tr>`)
    .join('');

  const questionsHtml = (analysis.top_questions || [])
    .slice(0, 8)
    .map(q => `<tr><td>${q.text.slice(0, 120)}</td><td>${q.count}</td></tr>`)
    .join('');

  const painsHtml = (analysis.top_pains || [])
    .slice(0, 8)
    .map(p => `<tr><td>${p.text.slice(0, 120)}</td><td>${p.count}</td></tr>`)
    .join('');

  const influencersHtml = (analysis.influencers || [])
    .slice(0, 10)
    .map((u, i) => `<tr><td>${i + 1}</td><td>${u.name}</td><td>${u.messages}</td><td>${u.score.toFixed(1)}</td><td><span class="badge badge-${u.level}">${u.level}</span></td></tr>`)
    .join('');

  const suggestionsHtml = (analysis.content_suggestions || [])
    .map(s => `<tr><td><span class="badge badge-${s.priority}">${s.priority}</span></td><td>${s.type}</td><td>${s.suggestion}</td><td>${s.format}</td></tr>`)
    .join('');

  const viralHtml = (analysis.viral_topics || [])
    .map(v => `<tr><td>${v.topic}</td><td>${v.message_count}</td><td>${v.velocity}x</td><td>${v.timestamp.split('T')[0]}</td></tr>`)
    .join('');

  const hourBars = (analysis.hour_distribution || [])
    .map((c, h) => {
      const max = Math.max(...(analysis.hour_distribution || [1]));
      const pct = max > 0 ? (c / max * 100) : 0;
      return `<div class="hour-bar"><span class="hour-label">${h}h</span><div class="bar" style="width:${pct}%"></div><span class="hour-count">${c}</span></div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatorio ${agent.name} — ${date}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #0a0e1a; color: #e0e0e0; padding: 24px; }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { color: #00e5cc; font-size: 1.6rem; margin-bottom: 4px; }
  h2 { color: #00e5cc; font-size: 1.1rem; margin: 24px 0 12px; border-bottom: 1px solid rgba(0,229,204,0.2); padding-bottom: 6px; }
  .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 20px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; text-align: center; }
  .stat-val { font-size: 1.8rem; font-weight: 700; color: #00e5cc; }
  .stat-val.red { color: #ef4444; }
  .stat-val.yellow { color: #eab308; }
  .stat-label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 0.85rem; }
  th { text-align: left; color: #00e5cc; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; padding: 8px 12px; border-bottom: 1px solid rgba(0,229,204,0.2); }
  td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .badge-high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .badge-medium { background: rgba(249,115,22,0.15); color: #f97316; }
  .badge-low { background: rgba(0,229,204,0.1); color: #00e5cc; }
  .hour-bar { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
  .hour-label { width: 30px; font-size: 0.72rem; color: #888; text-align: right; }
  .bar { height: 16px; background: linear-gradient(90deg, #00e5cc, #0088cc); border-radius: 3px; min-width: 2px; }
  .hour-count { font-size: 0.72rem; color: #888; }
  .segments { display: flex; gap: 16px; margin: 10px 0; }
  .seg-block { flex: 1; background: rgba(255,255,255,0.04); border-radius: 8px; padding: 14px; text-align: center; }
  .seg-val { font-size: 1.4rem; font-weight: 700; color: #00e5cc; }
  .seg-label { font-size: 0.72rem; color: #888; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.72rem; color: #555; text-align: center; }
  @media print {
    body { background: #fff; color: #222; }
    .stat-card, .seg-block { border-color: #ddd; }
    .stat-val, h1, h2, th, .badge-low { color: #0088cc; }
    .bar { background: #0088cc; }
    td { border-bottom-color: #eee; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>RELATORIO — ${agent.name}</h1>
  <div class="subtitle">Squad Telegram Intelligence | Gerado em ${date} as ${time} | ${analysis.total_messages} mensagens analisadas</div>

  <div class="stats-grid">
    <div class="stat-card"><div class="stat-val">${analysis.total_messages}</div><div class="stat-label">Mensagens</div></div>
    <div class="stat-card"><div class="stat-val">${analysis.classification?.duvidas || 0}</div><div class="stat-label">Duvidas</div></div>
    <div class="stat-card"><div class="stat-val${(analysis.classification?.dores || 0) > 0 ? ' red' : ''}">${analysis.classification?.dores || 0}</div><div class="stat-label">Dores</div></div>
    <div class="stat-card"><div class="stat-val">${analysis.classification?.engajamento || 0}</div><div class="stat-label">Engajamento</div></div>
    <div class="stat-card"><div class="stat-val">${analysis.influencers?.length || 0}</div><div class="stat-label">Influenciadores</div></div>
    <div class="stat-card"><div class="stat-val">${analysis.viral_topics?.length || 0}</div><div class="stat-label">Temas Virais</div></div>
  </div>

  <h2>Topicos Mais Discutidos</h2>
  <table><tr><th>Topico</th><th>Frequencia</th></tr>${topicsHtml || '<tr><td colspan="2">Sem dados</td></tr>'}</table>

  <h2>Duvidas Recorrentes</h2>
  <table><tr><th>Duvida</th><th>Vezes</th></tr>${questionsHtml || '<tr><td colspan="2">Sem dados</td></tr>'}</table>

  <h2>Dores da Audiencia</h2>
  <table><tr><th>Dor</th><th>Vezes</th></tr>${painsHtml || '<tr><td colspan="2">Sem dados</td></tr>'}</table>

  <h2>Influenciadores</h2>
  <table><tr><th>#</th><th>Nome</th><th>Msgs</th><th>Score</th><th>Nivel</th></tr>${influencersHtml || '<tr><td colspan="5">Sem dados</td></tr>'}</table>

  <h2>Segmentacao de Usuarios</h2>
  <div class="segments">
    <div class="seg-block"><div class="seg-val">${analysis.segments?.iniciantes || 0}</div><div class="seg-label">Iniciantes</div></div>
    <div class="seg-block"><div class="seg-val">${analysis.segments?.intermediarios || 0}</div><div class="seg-label">Intermediarios</div></div>
    <div class="seg-block"><div class="seg-val">${analysis.segments?.avancados || 0}</div><div class="seg-label">Avancados</div></div>
  </div>

  ${viralHtml ? `<h2>Temas Virais</h2><table><tr><th>Topico</th><th>Msgs</th><th>Velocidade</th><th>Data</th></tr>${viralHtml}</table>` : ''}

  <h2>Distribuicao por Horario</h2>
  <div style="margin-bottom: 16px;">${hourBars}</div>

  <h2>Sugestoes de Conteudo</h2>
  <table><tr><th>Prioridade</th><th>Tipo</th><th>Sugestao</th><th>Formato</th></tr>${suggestionsHtml || '<tr><td colspan="4">Sem sugestoes</td></tr>'}</table>

  <div class="footer">AIOX Squad Telegram Intelligence — Relatorio gerado automaticamente pelo agente Sentinel (@autoavaliativo)</div>
</div>
</body>
</html>`;
}

async function cmdExport(agentFilter) {
  ensureDataDir();
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const agents = agentFilter === 'all' ? Object.keys(AGENTS) : [agentFilter];

  for (const id of agents) {
    if (!AGENTS[id]) {
      console.log(`  Agente desconhecido: ${id}`);
      continue;
    }

    const analysisPath = path.join(DATA_DIR, `${id}-analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      console.log(`  ${AGENTS[id].name}: Sem analise. Execute: analyze ${id}`);
      continue;
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const html = generateReportHtml(id, analysis);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `relatorio-${id}-${dateStr}.html`;
    const filePath = path.join(REPORTS_DIR, fileName);

    fs.writeFileSync(filePath, html);
    console.log(`  ${AGENTS[id].name}: Relatorio exportado`);
    console.log(`    Arquivo: ${filePath}`);
    console.log('    Para PDF: abra no navegador e use Ctrl+P / Cmd+P');
  }

  // Generate index file listing all reports
  const reportFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('relatorio-') && f.endsWith('.html'))
    .sort()
    .reverse();

  const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatorios Telegram</title>
<style>
  body { font-family: Inter, sans-serif; background: #0a0e1a; color: #e0e0e0; padding: 40px; }
  h1 { color: #00e5cc; margin-bottom: 20px; }
  a { color: #00e5cc; text-decoration: none; display: block; padding: 10px 16px; margin: 4px 0; background: rgba(255,255,255,0.04); border-radius: 6px; }
  a:hover { background: rgba(0,229,204,0.08); }
</style></head><body>
<h1>Relatorios — Squad Telegram Intelligence</h1>
${reportFiles.map(f => `<a href="${f}">${f.replace('.html', '').replace('relatorio-', '').replace(/-/g, ' ')}</a>`).join('\n')}
</body></html>`;

  fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), indexHtml);
  console.log(`\n  Indice de relatorios: ${path.join(REPORTS_DIR, 'index.html')}`);
  console.log('');
}

// ── Notify Operator via Telegram ────────────────────────────────

async function cmdSetupNotify() {
  const env = loadEnv();
  // Use the first bot to get the operator's chat_id
  const token = getToken(env, 'professor');
  if (!token) {
    console.log('  Token do bot Professor nao configurado.');
    return;
  }

  console.log('\n  CONFIGURACAO DE NOTIFICACOES');
  console.log('  ----------------------------');
  console.log('  1. Abra o Telegram');
  console.log('  2. Procure por @OPROFESSORTetris_bot');
  console.log('  3. Envie /start ou qualquer mensagem');
  console.log('  4. Execute este comando novamente\n');

  console.log('  Verificando mensagens recentes...');

  try {
    const result = await telegramApi(token, 'getUpdates', { limit: 10 });
    if (!result.ok || !result.result || result.result.length === 0) {
      console.log('  Nenhuma mensagem encontrada. Envie uma mensagem ao bot primeiro.');
      return;
    }

    // Find DMs (not group messages)
    const dms = result.result
      .filter(u => u.message && u.message.chat && u.message.chat.type === 'private')
      .map(u => ({
        chat_id: u.message.chat.id,
        name: `${u.message.from.first_name || ''} ${u.message.from.last_name || ''}`.trim(),
        username: u.message.from.username || '',
      }));

    if (dms.length === 0) {
      console.log('  Nenhuma DM encontrada. Envie uma mensagem direta ao bot @OPROFESSORTetris_bot.');
      return;
    }

    // Use the first DM as the operator
    const operator = dms[0];
    const config = {
      chat_id: operator.chat_id,
      name: operator.name,
      username: operator.username,
      configured_at: new Date().toISOString(),
    };

    ensureDataDir();
    fs.writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('  Operador configurado:');
    console.log(`    Nome: ${operator.name}`);
    console.log(`    Username: @${operator.username}`);
    console.log(`    Chat ID: ${operator.chat_id}`);
    console.log('\n  Notificacoes serao enviadas para este chat.\n');
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }
}

function getNotifyConfig() {
  if (!fs.existsSync(NOTIFY_CONFIG_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(NOTIFY_CONFIG_PATH, 'utf8'));
  } catch (_e) {
    return null;
  }
}

async function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/${encodeURIComponent('sendMessage')}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function cmdNotify(agentFilter) {
  const config = getNotifyConfig();
  if (!config) {
    console.log('  Notificacoes nao configuradas.');
    console.log('  Execute: node bin/telegram-monitor.js setup-notify');
    return;
  }

  const env = loadEnv();
  const agents = agentFilter === 'all' ? Object.keys(AGENTS) : [agentFilter];

  for (const id of agents) {
    if (!AGENTS[id]) continue;

    // Each bot sends its own notification (read-only policy: DM to operator only)
    const token = getToken(env, id);
    if (!token) {
      console.log(`  ${AGENTS[id].name}: Token nao configurado. Pulando.`);
      continue;
    }

    const analysisPath = path.join(DATA_DIR, `${id}-analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      console.log(`  ${AGENTS[id].name}: Sem analise. Execute: analyze ${id}`);
      continue;
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const c = analysis.classification || {};
    const segs = analysis.segments || {};

    // Build concise Telegram message
    let msg = `<b>RELATORIO — ${AGENTS[id].name}</b>\n`;
    msg += '<i>Squad Telegram Intelligence</i>\n\n';

    msg += '<b>Resumo</b>\n';
    msg += `Mensagens: ${analysis.total_messages}\n`;
    msg += `Duvidas: ${c.duvidas || 0} | Dores: ${c.dores || 0} | Engajamento: ${c.engajamento || 0}\n\n`;

    // Top topics
    const topTopics = (analysis.topics?.bigrams || []).slice(0, 5);
    if (topTopics.length > 0) {
      msg += '<b>Topicos</b>\n';
      topTopics.forEach(t => { msg += `• ${t.topic} (${t.count}x)\n`; });
      msg += '\n';
    }

    // Top questions
    const topQ = (analysis.top_questions || []).slice(0, 3);
    if (topQ.length > 0) {
      msg += '<b>Duvidas</b>\n';
      topQ.forEach(q => { msg += `• ${q.text.slice(0, 80)}\n`; });
      msg += '\n';
    }

    // Top pains
    const topP = (analysis.top_pains || []).slice(0, 3);
    if (topP.length > 0) {
      msg += '<b>Dores</b>\n';
      topP.forEach(p => { msg += `• ${p.text.slice(0, 80)}\n`; });
      msg += '\n';
    }

    // Segments
    msg += '<b>Segmentacao</b>\n';
    msg += `Iniciantes: ${segs.iniciantes || 0} | Intermediarios: ${segs.intermediarios || 0} | Avancados: ${segs.avancados || 0}\n\n`;

    // Suggestions
    const sug = (analysis.content_suggestions || []).slice(0, 3);
    if (sug.length > 0) {
      msg += '<b>Sugestoes</b>\n';
      sug.forEach(s => { msg += `• [${s.priority}] ${s.suggestion.slice(0, 80)}\n`; });
      msg += '\n';
    }

    // Peak hours
    const peaks = (analysis.peak_hours || []).slice(0, 3);
    if (peaks.length > 0) {
      msg += `<b>Pico:</b> ${peaks.map(h => `${h.hour}h (${h.count})`).join(', ')}\n`;
    }

    msg += `\n<i>Gerado: ${new Date().toLocaleString('pt-BR')}</i>`;

    console.log(`  Enviando relatorio de ${AGENTS[id].name} via bot @${AGENTS[id].botUsername}...`);

    try {
      const result = await sendTelegramMessage(token, config.chat_id, msg);
      if (result.ok) {
        console.log(`  Enviado com sucesso via ${AGENTS[id].name}.`);
      } else {
        console.log(`  Erro: ${result.description || 'Unknown'}`);
      }
    } catch (err) {
      console.log(`  Erro ao enviar: ${err.message}`);
    }
  }
  console.log('');
}

// ── Pipeline (Full Automated Run) ──────────────────────────────

async function cmdPipeline() {
  const start = Date.now();
  const timestamp = new Date().toLocaleString('pt-BR');

  console.log('\n  PIPELINE AUTOMATICO — Squad Telegram Intelligence');
  console.log(`  ${timestamp}`);
  console.log('  ================================================\n');

  // Step 1: Listen (collect messages from all agents)
  console.log('  [1/4] Coletando mensagens...');
  try {
    await cmdListen('all');
  } catch (err) {
    console.log(`  Erro na coleta: ${err.message}`);
  }

  // Step 2: Analyze all agents
  console.log('  [2/4] Analisando dados...');
  try {
    await cmdAnalyze('all');
  } catch (err) {
    console.log(`  Erro na analise: ${err.message}`);
  }

  // Step 3: Export reports
  console.log('  [3/4] Exportando relatorios...');
  try {
    await cmdExport('all');
  } catch (err) {
    console.log(`  Erro na exportacao: ${err.message}`);
  }

  // Step 4: Notify operator
  console.log('  [4/4] Enviando notificacoes...');
  try {
    await cmdNotify('all');
  } catch (err) {
    console.log(`  Erro na notificacao: ${err.message}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Pipeline completo em ${elapsed}s`);
  console.log('  ================================================\n');

  // Log pipeline execution
  const logPath = path.join(DATA_DIR, 'pipeline-log.json');
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
  log.push({ timestamp: new Date().toISOString(), elapsed_s: parseFloat(elapsed), agents: Object.keys(AGENTS).length });
  if (log.length > 30) log.splice(0, log.length - 30);
  ensureDataDir();
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

// ── Cron Management (macOS launchd) ────────────────────────────

const PLIST_NAME = 'com.aiox.telegram-pipeline';
const PLIST_PATH = path.join(process.env.HOME, 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);

function generatePlist() {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(__dirname, 'intelligence-pipeline.js');
  const projectDir = path.resolve(__dirname, '..');
  const logOut = path.join(DATA_DIR, 'cron-stdout.log');
  const logErr = path.join(DATA_DIR, 'cron-stderr.log');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
    <string>pipeline</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${projectDir}</string>

  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>8</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <dict>
      <key>Hour</key>
      <integer>20</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
  </array>

  <key>StandardOutPath</key>
  <string>${logOut}</string>
  <key>StandardErrorPath</key>
  <string>${logErr}</string>

  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;
}

function cmdCronInstall() {
  ensureDataDir();

  const plistDir = path.dirname(PLIST_PATH);
  if (!fs.existsSync(plistDir)) {
    fs.mkdirSync(plistDir, { recursive: true });
  }

  fs.writeFileSync(PLIST_PATH, generatePlist());

  const { execSync } = require('child_process');
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: 'ignore' });
  } catch (_e) { /* ignore if not loaded */ }
  execSync(`launchctl load "${PLIST_PATH}"`);

  console.log('\n  AGENDAMENTO INSTALADO');
  console.log('  ---------------------');
  console.log('  Frequencia: Diariamente as 08:00 e 20:00');
  console.log('  Pipeline:   listen all > analyze all > export all > notify all');
  console.log(`  Plist:      ${PLIST_PATH}`);
  console.log(`  Log:        ${path.join(DATA_DIR, 'cron-stdout.log')}`);
  console.log('\n  O pipeline roda automaticamente todo dia as 8h.');
  console.log('  Para executar agora: node bin/telegram-monitor.js pipeline');
  console.log('  Para remover:        node bin/telegram-monitor.js cron-remove\n');
}

function cmdCronRemove() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log('  Nenhum agendamento encontrado.\n');
    return;
  }

  const { execSync } = require('child_process');
  try {
    execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: 'ignore' });
  } catch (_e) { /* ignore */ }
  fs.unlinkSync(PLIST_PATH);

  console.log('\n  AGENDAMENTO REMOVIDO');
  console.log('  --------------------');
  console.log('  O pipeline nao roda mais automaticamente.');
  console.log('  Para reinstalar: node bin/telegram-monitor.js cron-install\n');
}

function cmdCronStatus() {
  console.log('\n  STATUS DO AGENDAMENTO');
  console.log('  ---------------------');

  if (!fs.existsSync(PLIST_PATH)) {
    console.log('  Status: NAO INSTALADO');
    console.log('  Para instalar: node bin/telegram-monitor.js cron-install\n');
    return;
  }

  console.log('  Status: INSTALADO');
  console.log('  Frequencia: Diariamente as 08:00 e 20:00');
  console.log(`  Plist: ${PLIST_PATH}`);

  const { execSync } = require('child_process');
  try {
    const result = execSync(`launchctl list | grep ${PLIST_NAME} 2>/dev/null`, { encoding: 'utf8' });
    if (result.trim()) {
      console.log('  launchd: ATIVO');
    } else {
      console.log('  launchd: INATIVO (mac reiniciou? execute cron-install)');
    }
  } catch (_e) {
    console.log('  launchd: INATIVO');
  }

  const logPath = path.join(DATA_DIR, 'pipeline-log.json');
  if (fs.existsSync(logPath)) {
    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const last = log.slice(-3);
    if (last.length > 0) {
      console.log('\n  Ultimas execucoes:');
      last.forEach(entry => {
        const d = new Date(entry.timestamp).toLocaleString('pt-BR');
        console.log(`    ${d} — ${entry.elapsed_s}s — ${entry.agents} agentes`);
      });
    }
  }

  console.log('');
}

// ── Import Telegram Desktop Export ──────────────────────────────

function cmdImport(filePath, agentId) {
  if (!filePath) {
    console.log(`
  IMPORTAR HISTORICO — Telegram Desktop Export

  Uso:
    node bin/telegram-monitor.js import <result.json> <agent>

  Exemplo:
    node bin/telegram-monitor.js import ~/Downloads/DataExport/result.json professor

  Como exportar do Telegram Desktop:
    1. Abra o Telegram Desktop
    2. Va no grupo > 3 pontos > Export Chat History
    3. Selecione: formato JSON, sem midia
    4. Salve e use o caminho do result.json

  Agentes: ${Object.keys(AGENTS).join(', ')}
`);
    return;
  }

  if (!agentId || !AGENTS[agentId]) {
    console.log('  Erro: agente invalido ou nao informado.');
    console.log('  Uso: node bin/telegram-monitor.js import <result.json> <agent>');
    console.log(`  Agentes: ${Object.keys(AGENTS).join(', ')}`);
    return;
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.log(`  Erro: arquivo nao encontrado: ${resolvedPath}`);
    return;
  }

  console.log(`\n  IMPORTANDO HISTORICO — ${AGENTS[agentId].name}`);
  console.log(`  Arquivo: ${resolvedPath}`);
  console.log('  ' + '-'.repeat(60));

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    console.log(`  Erro ao ler JSON: ${err.message}`);
    return;
  }

  // Telegram Desktop export has: { chats: { list: [ { messages: [...] } ] } }
  // or for single chat export: { messages: [...] }
  let rawMessages = [];

  if (data.messages && Array.isArray(data.messages)) {
    // Single chat export
    rawMessages = data.messages;
  } else if (data.chats && data.chats.list) {
    // Full export — pick the first chat with messages (or all)
    for (const chat of data.chats.list) {
      if (chat.messages && chat.messages.length > 0) {
        rawMessages.push(...chat.messages);
      }
    }
  } else {
    console.log('  Erro: formato JSON nao reconhecido.');
    console.log('  Esperado: export do Telegram Desktop (result.json)');
    return;
  }

  // Filter only text messages (type === 'message', skip service messages)
  const textMessages = rawMessages.filter(m =>
    m.type === 'message' && m.text && m.text !== '',
  );

  console.log(`  Total de registros no arquivo: ${rawMessages.length}`);
  console.log(`  Mensagens de texto: ${textMessages.length}`);

  // Convert to our internal format
  const converted = textMessages.map(m => {
    // text can be string or array of entities
    let text = '';
    if (typeof m.text === 'string') {
      text = m.text;
    } else if (Array.isArray(m.text)) {
      text = m.text.map(part =>
        typeof part === 'string' ? part : (part.text || ''),
      ).join('');
    }

    // Parse from_id: "user123456" → 123456
    let fromId = null;
    if (m.from_id) {
      const match = m.from_id.match(/\d+/);
      if (match) fromId = parseInt(match[0], 10);
    }

    // Parse date: ISO string or unix timestamp
    let unixDate;
    if (m.date_unixtime) {
      unixDate = parseInt(m.date_unixtime, 10);
    } else if (m.date) {
      unixDate = Math.floor(new Date(m.date).getTime() / 1000);
    } else {
      unixDate = 0;
    }

    return {
      message_id: m.id,
      date: unixDate,
      from: m.from || 'Desconhecido',
      from_id: fromId,
      chat_id: null, // not available in export
      chat_title: data.name || data.chats?.list?.[0]?.name || AGENTS[agentId].name,
      text: text,
      source: 'import',
    };
  }).filter(m => m.text.trim() !== '');

  // Save using existing saveMessages function (deduplicates by message_id)
  const newCount = saveMessages(agentId, converted);

  // Date range
  const dates = converted.map(m => m.date).filter(d => d > 0).sort((a, b) => a - b);
  const firstDate = dates.length > 0 ? formatDate(dates[0]) : 'N/A';
  const lastDate = dates.length > 0 ? formatDate(dates[dates.length - 1]) : 'N/A';

  console.log('\n  Resultado:');
  console.log(`    Convertidas: ${converted.length}`);
  console.log(`    Novas (nao duplicadas): ${newCount}`);
  console.log(`    Periodo: ${firstDate} a ${lastDate}`);
  console.log(`    Agente: ${AGENTS[agentId].name}`);
  console.log(`\n  Dados salvos em: .aiox/telegram/${agentId}-messages.json`);
  console.log(`  Execute 'analyze ${agentId}' para gerar relatorio com historico completo.\n`);
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const param = args[1] || 'all';

  switch (command) {
    case 'status':
      await cmdStatus();
      break;

    case 'groups':
      await cmdGroups();
      break;

    case 'listen':
      await cmdListen(param);
      break;

    case 'report':
      if (param === 'all') {
        for (const id of Object.keys(AGENTS)) {
          await cmdReport(id);
        }
      } else if (AGENTS[param]) {
        await cmdReport(param);
      } else {
        console.log(`  Agente desconhecido: ${param}`);
        console.log(`  Disponiveis: ${Object.keys(AGENTS).join(', ')}`);
      }
      break;

    case 'analyze':
      await cmdAnalyze(param);
      break;

    case 'sync':
      await cmdSync(param);
      break;

    case 'export':
      await cmdExport(param);
      break;

    case 'notify':
      await cmdNotify(param);
      break;

    case 'setup-notify':
      await cmdSetupNotify();
      break;

    case 'pipeline':
      await cmdPipeline();
      break;

    case 'cron-install':
      cmdCronInstall();
      break;

    case 'cron-remove':
      cmdCronRemove();
      break;

    case 'cron-status':
      cmdCronStatus();
      break;

    case 'import':
      cmdImport(param === 'all' ? null : param, args[2]);
      break;

    default:
      console.log(`
  SQUAD TELEGRAM INTELLIGENCE — CLI

  Uso:
    node bin/telegram-monitor.js status              Verifica status dos bots
    node bin/telegram-monitor.js groups              Lista grupos de cada bot
    node bin/telegram-monitor.js listen [agent|all]  Coleta mensagens
    node bin/telegram-monitor.js report [agent|all]  Gera relatorio basico
    node bin/telegram-monitor.js analyze [agent|all] Analise inteligente completa
    node bin/telegram-monitor.js sync [agent|all]    Sincroniza dados com Supabase
    node bin/telegram-monitor.js export [agent|all]  Gera relatorio HTML (PDF)
    node bin/telegram-monitor.js notify [agent|all]  Envia relatorio ao operador
    node bin/telegram-monitor.js setup-notify        Configura chat do operador
    node bin/telegram-monitor.js pipeline            Pipeline completo automatico
    node bin/telegram-monitor.js cron-install        Instala agendamento diario (8h)
    node bin/telegram-monitor.js cron-remove         Remove agendamento
    node bin/telegram-monitor.js cron-status         Status do agendamento
    node bin/telegram-monitor.js import <json> <agent> Importa historico (Telegram Desktop)

  Agentes: ${Object.keys(AGENTS).join(', ')}
`);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
