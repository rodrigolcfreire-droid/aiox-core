#!/usr/bin/env node
'use strict';

/**
 * whatsapp-monitor.js — CLI para Squad WhatsApp Intelligence
 *
 * Comandos:
 *   node bin/whatsapp-monitor.js connect                Conecta ao WhatsApp (QR Code)
 *   node bin/whatsapp-monitor.js status                 Verifica status da conexao
 *   node bin/whatsapp-monitor.js groups                 Lista grupos disponiveis
 *   node bin/whatsapp-monitor.js listen [group|all]     Coleta mensagens dos grupos
 *   node bin/whatsapp-monitor.js analyze [group|all]    Analise inteligente completa
 *   node bin/whatsapp-monitor.js export [group|all]     Gera relatorio HTML
 *   node bin/whatsapp-monitor.js notify [group|all]     Envia relatorio ao operador via Telegram
 *   node bin/whatsapp-monitor.js pipeline               Pipeline completo automatico
 *   node bin/whatsapp-monitor.js disconnect              Desconecta sessao WhatsApp
 *
 * CLI First: Este script e a fonte da verdade para monitoramento WhatsApp.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  STOP_WORDS, classifyMessage, suggestContent,
} = require('./lib/message-classifier');

const DATA_DIR = path.resolve(__dirname, '..', '.aiox', 'whatsapp');
const SESSION_DIR = path.join(DATA_DIR, 'session');
const REPORTS_DIR = path.resolve(__dirname, '..', 'docs', 'examples', 'ux-command-center', 'reports');
const GROUPS_CONFIG_PATH = path.join(DATA_DIR, 'groups-config.json');
const ENV_PATH = path.resolve(__dirname, '..', '.env');
const NOTIFY_CONFIG_PATH = path.resolve(__dirname, '..', '.aiox', 'telegram', 'notify-config.json');

// ── Helpers ─────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

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
  } catch (_err) {
    // .env optional for whatsapp
  }
  return env;
}

function getGroupsConfig() {
  if (!fs.existsSync(GROUPS_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(GROUPS_CONFIG_PATH, 'utf8'));
  } catch (_e) {
    return {};
  }
}

function saveGroupsConfig(config) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(GROUPS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function slugify(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function saveMessages(groupSlug, messages) {
  ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, `${groupSlug}-messages.json`);
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

// ── NLP Analysis (shared module) ────────────────────────────────
// Classification logic imported from bin/lib/message-classifier.js

function extractTopics(messages) {
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

  return {
    bigrams: [...bigrams.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15),
    trigrams: [...trigrams.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

function detectInfluencers(messages) {
  const userStats = new Map();
  messages.forEach(m => {
    const uid = m.from_id || m.from;
    if (!userStats.has(uid)) {
      userStats.set(uid, { name: m.from, user_id: m.from_id, count: 0, long_messages: 0, links_shared: 0 });
    }
    const u = userStats.get(uid);
    u.count++;
    if ((m.text || '').length > 200) u.long_messages++;
    if (/https?:\/\//i.test(m.text || '')) u.links_shared++;
  });

  return [...userStats.values()]
    .map(u => {
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
      userStats.set(uid, { name: m.from, user_id: m.from_id, count: 0, questions: 0, helpful_answers: 0 });
    }
    const u = userStats.get(uid);
    u.count++;
    const tags = classifyMessage(m.text);
    if (tags.includes('duvida')) u.questions++;
    if (tags.includes('engajamento') && (m.text || '').length > 100) u.helpful_answers++;
  });

  return [...userStats.values()].map(u => {
    const qRatio = u.count > 0 ? u.questions / u.count : 0;
    if (u.count >= 10 && qRatio < 0.3 && u.helpful_answers >= 2) {
      u.segment = 'avancado';
    } else if (qRatio > 0.5 || u.count < 5) {
      u.segment = 'iniciante';
    } else {
      u.segment = 'intermediario';
    }
    return u;
  });
}

function detectViralTopics(messages) {
  const timeWindows = new Map();
  messages.forEach(m => {
    const hour = Math.floor(m.date / 3600) * 3600;
    if (!timeWindows.has(hour)) timeWindows.set(hour, []);
    timeWindows.get(hour).push(m);
  });

  const windowCounts = [...timeWindows.entries()]
    .map(([ts, msgs]) => ({ ts, count: msgs.length, messages: msgs }))
    .sort((a, b) => b.count - a.count);

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

// ── WhatsApp Client ─────────────────────────────────────────────

async function createClient() {
  const { Client, LocalAuth } = require('whatsapp-web.js');

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_DIR,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  return client;
}

// ── Commands ────────────────────────────────────────────────────

async function cmdConnect() {
  ensureDir(SESSION_DIR);
  const qrcode = require('qrcode-terminal');

  console.log('\n  WHATSAPP INTELLIGENCE — Conexao');
  console.log('  ================================\n');

  const client = await createClient();
  let connected = false;

  client.on('qr', (qr) => {
    console.log('  Escaneie o QR Code abaixo no seu WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n  WhatsApp > Configuracoes > Dispositivos conectados > Conectar dispositivo\n');
  });

  client.on('ready', async () => {
    connected = true;
    console.log('\n  CONECTADO COM SUCESSO!\n');

    // List groups
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);

    console.log(`  ${groups.length} grupos encontrados:\n`);

    const config = {};
    groups.forEach((g, i) => {
      const slug = slugify(g.name);
      config[slug] = {
        name: g.name,
        id: g.id._serialized,
        participants: g.participants ? g.participants.length : 0,
      };
      console.log(`    ${(i + 1 + '.').padEnd(4)} ${g.name} (${slug})`);
    });

    saveGroupsConfig(config);
    console.log(`\n  Grupos salvos em: ${GROUPS_CONFIG_PATH}`);
    console.log('  Sessao salva. Proxima conexao sera automatica.\n');
    console.log('  Use: node bin/whatsapp-monitor.js groups       — ver grupos');
    console.log('  Use: node bin/whatsapp-monitor.js listen all   — coletar mensagens\n');

    await client.destroy();
    process.exit(0);
  });

  client.on('auth_failure', (msg) => {
    console.log(`  Falha na autenticacao: ${msg}`);
    process.exit(1);
  });

  console.log('  Iniciando WhatsApp Web...');
  await client.initialize();

  // Timeout after 2 minutes
  setTimeout(() => {
    if (!connected) {
      console.log('\n  Timeout: QR Code nao escaneado em 2 minutos.');
      console.log('  Execute novamente: node bin/whatsapp-monitor.js connect\n');
      process.exit(1);
    }
  }, 120000);
}

async function cmdStatus() {
  console.log('\n  WHATSAPP INTELLIGENCE — Status\n');

  const sessionExists = fs.existsSync(path.join(SESSION_DIR, 'session')) || fs.existsSync(path.join(SESSION_DIR, 'Default'));
  if (!sessionExists) {
    console.log('  Sessao: NAO CONECTADO');
    console.log('  Execute: node bin/whatsapp-monitor.js connect\n');
    return;
  }

  console.log('  Sessao: SALVA (tentando conectar...)\n');

  try {
    const client = await createClient();
    let resolved = false;

    client.on('ready', async () => {
      resolved = true;
      const chats = await client.getChats();
      const groups = chats.filter(c => c.isGroup);
      const info = client.info;

      console.log('  Status: CONECTADO');
      console.log(`  Numero: ${info.wid.user}`);
      console.log(`  Nome: ${info.pushname}`);
      console.log(`  Grupos: ${groups.length}`);

      const config = getGroupsConfig();
      const monitored = Object.keys(config).length;
      console.log(`  Monitorados: ${monitored}`);

      // Check messages collected
      const msgFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-messages.json'));
      let totalMsgs = 0;
      msgFiles.forEach(f => {
        try {
          const msgs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
          totalMsgs += msgs.length;
        } catch (_e) { /* ignore */ }
      });
      console.log(`  Mensagens coletadas: ${totalMsgs}`);
      console.log('');

      await client.destroy();
      process.exit(0);
    });

    client.on('auth_failure', () => {
      resolved = true;
      console.log('  Status: SESSAO EXPIRADA');
      console.log('  Execute: node bin/whatsapp-monitor.js connect\n');
      process.exit(1);
    });

    await client.initialize();

    setTimeout(() => {
      if (!resolved) {
        console.log('  Status: TIMEOUT (sessao pode ter expirado)');
        console.log('  Execute: node bin/whatsapp-monitor.js connect\n');
        process.exit(1);
      }
    }, 30000);
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
    console.log('  Execute: node bin/whatsapp-monitor.js connect\n');
  }
}

async function cmdGroups() {
  const config = getGroupsConfig();
  const keys = Object.keys(config);

  if (keys.length === 0) {
    console.log('\n  Nenhum grupo registrado.');
    console.log('  Execute: node bin/whatsapp-monitor.js connect\n');
    return;
  }

  console.log('\n  WHATSAPP INTELLIGENCE — Grupos Monitorados\n');
  console.log('  ' + '-'.repeat(60));

  keys.forEach((slug, i) => {
    const g = config[slug];
    const msgPath = path.join(DATA_DIR, `${slug}-messages.json`);
    let msgCount = 0;
    if (fs.existsSync(msgPath)) {
      try {
        msgCount = JSON.parse(fs.readFileSync(msgPath, 'utf8')).length;
      } catch (_e) { /* ignore */ }
    }
    console.log(`  ${(i + 1 + '.').padEnd(4)} ${g.name}`);
    console.log(`       Slug: ${slug} | Mensagens: ${msgCount}`);
  });

  console.log('  ' + '-'.repeat(60));
  console.log('');
}

async function cmdListen(groupFilter) {
  const config = getGroupsConfig();
  if (Object.keys(config).length === 0) {
    console.log('\n  Nenhum grupo registrado. Execute: connect\n');
    return;
  }

  console.log('\n  WHATSAPP INTELLIGENCE — Coletando mensagens...\n');

  const client = await createClient();

  return new Promise((resolve) => {
    client.on('ready', async () => {
      const chats = await client.getChats();
      const groups = chats.filter(c => c.isGroup);

      const targets = groupFilter === 'all'
        ? Object.keys(config)
        : [groupFilter];

      for (const slug of targets) {
        const groupConfig = config[slug];
        if (!groupConfig) {
          console.log(`  Grupo desconhecido: ${slug}`);
          continue;
        }

        const group = groups.find(g => g.id._serialized === groupConfig.id);
        if (!group) {
          console.log(`  ${groupConfig.name}: Grupo nao encontrado (saiu do grupo?)`);
          continue;
        }

        console.log(`  Coletando: ${groupConfig.name}...`);

        try {
          const rawMessages = await group.fetchMessages({ limit: 200 });
          const messages = rawMessages
            .filter(m => m.body && m.body.trim().length > 0)
            .map(m => ({
              message_id: m.id._serialized,
              from: m._data.notifyName || m.author || 'Desconhecido',
              from_id: m.author || m.from,
              text: m.body,
              date: m.timestamp,
              group: groupConfig.name,
              group_id: groupConfig.id,
            }));

          const newCount = saveMessages(slug, messages);
          console.log(`    ${messages.length} mensagens encontradas, ${newCount} novas salvas`);

          // Show last 3
          const last3 = messages.slice(-3);
          last3.forEach(m => {
            const d = new Date(m.date * 1000).toISOString().replace('T', ' ').slice(0, 19);
            console.log(`    [${d}] ${m.from}: ${m.text.slice(0, 60)}${m.text.length > 60 ? '...' : ''}`);
          });
          console.log('');
        } catch (err) {
          console.log(`    Erro: ${err.message}\n`);
        }
      }

      await client.destroy();
      resolve();
    });

    client.on('auth_failure', () => {
      console.log('  Sessao expirada. Execute: connect\n');
      resolve();
    });

    client.initialize();

    setTimeout(() => {
      console.log('  Timeout na conexao.\n');
      resolve();
    }, 60000);
  });
}

async function cmdAnalyze(groupFilter) {
  ensureDir(DATA_DIR);
  const config = getGroupsConfig();
  const targets = groupFilter === 'all' ? Object.keys(config) : [groupFilter];

  for (const slug of targets) {
    const groupConfig = config[slug];
    if (!groupConfig) {
      console.log(`  Grupo desconhecido: ${slug}`);
      continue;
    }

    const filePath = path.join(DATA_DIR, `${slug}-messages.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${groupConfig.name}: Sem mensagens. Execute: listen ${slug}`);
      continue;
    }

    const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (messages.length === 0) {
      console.log(`  ${groupConfig.name}: 0 mensagens para analise.`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ANALISE INTELIGENTE — ${groupConfig.name}`);
    console.log(`  ${messages.length} mensagens analisadas`);
    console.log(`${'='.repeat(60)}`);

    // 1. Classify
    const classified = messages.map(m => ({ ...m, tags: classifyMessage(m.text) }));
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
    const qMap = new Map();
    questions.forEach(q => {
      const key = q.text.slice(0, 60).toLowerCase();
      if (!qMap.has(key)) qMap.set(key, { text: q.text, count: 0 });
      qMap.get(key).count++;
    });
    const topQ = [...qMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    console.log('\n  DUVIDAS RECORRENTES');
    topQ.forEach(q => { console.log(`    [${q.count}x] ${q.text.slice(0, 100)}`); });

    // 4. Pains
    const pMap = new Map();
    pains.forEach(p => {
      const key = p.text.slice(0, 60).toLowerCase();
      if (!pMap.has(key)) pMap.set(key, { text: p.text, count: 0 });
      pMap.get(key).count++;
    });
    const topP = [...pMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    console.log('\n  DORES DA AUDIENCIA');
    topP.forEach(p => { console.log(`    [${p.count}x] ${p.text.slice(0, 100)}`); });

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
        console.log(`    ${v.topic} — ${v.message_count} msgs, velocidade ${v.velocity}x`);
      });
    }

    // 8. Activity hours
    const hourCounts = new Array(24).fill(0);
    messages.forEach(m => { hourCounts[new Date(m.date * 1000).getHours()]++; });
    const top3Hours = hourCounts.map((c, h) => ({ hour: h, count: c }))
      .sort((a, b) => b.count - a.count).slice(0, 3);
    console.log('\n  HORARIOS DE PICO');
    top3Hours.forEach(h => { console.log(`    ${h.hour}h: ${h.count} mensagens`); });

    // 9. Suggestions
    const analysis = {
      questions: topQ, pains: topP, topics, viral,
      influencers: influencers.slice(0, 10),
      segments: { iniciantes: iniciantes.length, intermediarios: intermediarios.length, avancados: avancados.length },
      peak_hours: top3Hours,
    };
    const suggestions = suggestContent(analysis);

    if (suggestions.length > 0) {
      console.log('\n  SUGESTOES DE CONTEUDO');
      suggestions.forEach(s => {
        const pIcon = s.priority === 'high' ? '[!!!]' : '[ ! ]';
        console.log(`    ${pIcon} [${s.type}] ${s.suggestion}`);
      });
    }

    // Save full analysis
    const fullAnalysis = {
      group: slug,
      group_name: groupConfig.name,
      platform: 'whatsapp',
      generated_at: new Date().toISOString(),
      total_messages: messages.length,
      classification: { duvidas: questions.length, dores: pains.length, engajamento: engagements.length },
      top_questions: topQ,
      top_pains: topP,
      topics: {
        bigrams: topics.bigrams.map(([t, c]) => ({ topic: t, count: c })),
        trigrams: topics.trigrams.map(([t, c]) => ({ topic: t, count: c })),
      },
      influencers: influencers.slice(0, 15).map(u => ({
        name: u.name, user_id: u.user_id, messages: u.count, score: u.score, level: u.level,
      })),
      segments: { iniciantes: iniciantes.length, intermediarios: intermediarios.length, avancados: avancados.length },
      viral_topics: viral,
      peak_hours: top3Hours,
      content_suggestions: suggestions,
    };

    const analysisPath = path.join(DATA_DIR, `${slug}-analysis.json`);
    fs.writeFileSync(analysisPath, JSON.stringify(fullAnalysis, null, 2));
    console.log(`\n  Analise salva: ${analysisPath}`);
    console.log('');
  }
}

// ── Report HTML Generation ──────────────────────────────────────

function generateReportHtml(slug, analysis) {
  const c = analysis.classification || {};
  const topTopics = (analysis.topics?.bigrams || []).slice(0, 10);
  const topQ = (analysis.top_questions || []).slice(0, 8);
  const topP = (analysis.top_pains || []).slice(0, 8);
  const influencers = (analysis.influencers || []).slice(0, 10);
  const segs = analysis.segments || {};
  const peaks = (analysis.peak_hours || []).slice(0, 5);
  const sug = (analysis.content_suggestions || []).slice(0, 10);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Intelligence — ${analysis.group_name}</title>
<style>
  @media print { body { background: #fff !important; color: #111 !important; } .no-print { display: none; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Inter, -apple-system, sans-serif; background: #0a0e1a; color: #e0e0e0; padding: 30px; line-height: 1.6; }
  h1 { color: #25D366; font-size: 1.6rem; margin-bottom: 6px; }
  h2 { color: #25D366; font-size: 1.1rem; margin: 24px 0 10px; border-bottom: 1px solid rgba(37,211,102,0.2); padding-bottom: 6px; }
  .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 12px 0; }
  .stat-card { background: rgba(37,211,102,0.06); border-radius: 8px; padding: 14px; text-align: center; }
  .stat-val { font-size: 1.8rem; font-weight: 700; color: #25D366; display: block; }
  .stat-label { font-size: 0.72rem; color: #888; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; }
  th { color: #25D366; font-weight: 600; }
  .badge { padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
  .badge-high { background: rgba(37,211,102,0.15); color: #25D366; }
  .badge-medium { background: rgba(255,193,7,0.15); color: #ffc107; }
  .badge-low { background: rgba(255,255,255,0.08); color: #888; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); color: #555; font-size: 0.72rem; }
</style></head><body>
<h1>WHATSAPP INTELLIGENCE — ${analysis.group_name}</h1>
<p class="subtitle">Gerado: ${new Date(analysis.generated_at).toLocaleString('pt-BR')} | ${analysis.total_messages} mensagens | Plataforma: WhatsApp</p>

<div class="stat-grid">
  <div class="stat-card"><span class="stat-val">${analysis.total_messages}</span><span class="stat-label">Mensagens</span></div>
  <div class="stat-card"><span class="stat-val">${c.duvidas || 0}</span><span class="stat-label">Duvidas</span></div>
  <div class="stat-card"><span class="stat-val">${c.dores || 0}</span><span class="stat-label">Dores</span></div>
  <div class="stat-card"><span class="stat-val">${c.engajamento || 0}</span><span class="stat-label">Engajamento</span></div>
</div>

<h2>Topicos Mais Discutidos</h2>
<table>${topTopics.map(t => `<tr><td>${t.topic}</td><td>${t.count}x</td></tr>`).join('')}</table>

<h2>Duvidas Recorrentes</h2>
<table>${topQ.map(q => `<tr><td>${q.text.slice(0, 120)}</td><td>${q.count}x</td></tr>`).join('')}</table>

<h2>Dores da Audiencia</h2>
<table>${topP.map(p => `<tr><td>${p.text.slice(0, 120)}</td><td>${p.count}x</td></tr>`).join('')}</table>

<h2>Influenciadores</h2>
<table><tr><th>Nome</th><th>Msgs</th><th>Score</th><th>Nivel</th></tr>
${influencers.map(u => `<tr><td>${u.name}</td><td>${u.messages}</td><td>${u.score.toFixed(1)}</td><td><span class="badge badge-${u.level}">${u.level}</span></td></tr>`).join('')}</table>

<h2>Segmentacao</h2>
<div class="stat-grid">
  <div class="stat-card"><span class="stat-val">${segs.iniciantes || 0}</span><span class="stat-label">Iniciantes</span></div>
  <div class="stat-card"><span class="stat-val">${segs.intermediarios || 0}</span><span class="stat-label">Intermediarios</span></div>
  <div class="stat-card"><span class="stat-val">${segs.avancados || 0}</span><span class="stat-label">Avancados</span></div>
</div>

<h2>Horarios de Pico</h2>
<table>${peaks.map(h => `<tr><td>${h.hour}h</td><td>${h.count} mensagens</td></tr>`).join('')}</table>

<h2>Sugestoes de Conteudo</h2>
<table><tr><th>Tipo</th><th>Sugestao</th><th>Prioridade</th></tr>
${sug.map(s => `<tr><td>${s.type}</td><td>${s.suggestion}</td><td><span class="badge badge-${s.priority === 'high' ? 'high' : 'medium'}">${s.priority}</span></td></tr>`).join('')}</table>

<div class="footer">Squad WhatsApp Intelligence — AIOX | CLI First</div>
</body></html>`;
}

async function cmdExport(groupFilter) {
  ensureDir(REPORTS_DIR);
  const config = getGroupsConfig();
  const targets = groupFilter === 'all' ? Object.keys(config) : [groupFilter];

  console.log('\n  WHATSAPP INTELLIGENCE — Exportando relatorios...\n');

  for (const slug of targets) {
    const groupConfig = config[slug];
    if (!groupConfig) {
      console.log(`  Grupo desconhecido: ${slug}`);
      continue;
    }

    const analysisPath = path.join(DATA_DIR, `${slug}-analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      console.log(`  ${groupConfig.name}: Sem analise. Execute: analyze ${slug}`);
      continue;
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const html = generateReportHtml(slug, analysis);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `relatorio-whatsapp-${slug}-${dateStr}.html`;
    const filePath = path.join(REPORTS_DIR, fileName);

    fs.writeFileSync(filePath, html);
    console.log(`  ${groupConfig.name}: Relatorio exportado`);
    console.log(`    Arquivo: ${filePath}\n`);
  }

  console.log('');
}

// ── Notify (via Telegram bot) ───────────────────────────────────

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
    const postData = JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/${encodeURIComponent('sendMessage')}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
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

async function cmdNotify(groupFilter) {
  const notifyConfig = getNotifyConfig();
  if (!notifyConfig) {
    console.log('  Notificacoes nao configuradas.');
    console.log('  Execute: node bin/telegram-monitor.js setup-notify');
    return;
  }

  const env = loadEnv();
  const config = getGroupsConfig();
  const targets = groupFilter === 'all' ? Object.keys(config) : [groupFilter];

  // Use bot matching the group's expert
  const BOT_MAP = {
    'iris': 'TELEGRAM_BOT_IRISTHAIZE',
    'professor': 'TELEGRAM_BOT_PROFESSOR',
    'suhaviator': 'TELEGRAM_BOT_SUHAVIATOR',
    'caio': 'TELEGRAM_BOT_CAIO_ROLETA',
  };

  function pickBotToken(slug) {
    for (const [key, envKey] of Object.entries(BOT_MAP)) {
      if (slug.includes(key) && env[envKey]) return env[envKey];
    }
    return env.TELEGRAM_BOT_IRISTHAIZE || env.TELEGRAM_BOT_PROFESSOR;
  }

  for (const slug of targets) {
    const groupConfig = config[slug];
    if (!groupConfig) continue;

    const analysisPath = path.join(DATA_DIR, `${slug}-analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      console.log(`  ${groupConfig.name}: Sem analise.`);
      continue;
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const c = analysis.classification || {};
    const segs = analysis.segments || {};

    let msg = `<b>WHATSAPP — ${groupConfig.name}</b>\n`;
    msg += '<i>Squad WhatsApp Intelligence</i>\n\n';

    msg += '<b>Resumo</b>\n';
    msg += `Mensagens: ${analysis.total_messages}\n`;
    msg += `Duvidas: ${c.duvidas || 0} | Dores: ${c.dores || 0} | Engajamento: ${c.engajamento || 0}\n\n`;

    const topTopics = (analysis.topics?.bigrams || []).slice(0, 5);
    if (topTopics.length > 0) {
      msg += '<b>Topicos</b>\n';
      topTopics.forEach(t => { msg += `- ${t.topic} (${t.count}x)\n`; });
      msg += '\n';
    }

    const topQ = (analysis.top_questions || []).slice(0, 3);
    if (topQ.length > 0) {
      msg += '<b>Duvidas</b>\n';
      topQ.forEach(q => { msg += `- ${q.text.slice(0, 80)}\n`; });
      msg += '\n';
    }

    msg += '<b>Segmentacao</b>\n';
    msg += `Iniciantes: ${segs.iniciantes || 0} | Intermediarios: ${segs.intermediarios || 0} | Avancados: ${segs.avancados || 0}\n\n`;

    msg += `<i>Gerado: ${new Date().toLocaleString('pt-BR')}</i>`;

    const token = pickBotToken(slug);
    if (!token) {
      console.log(`  Sem token de bot para ${slug}`);
      continue;
    }

    console.log(`  Enviando relatorio de ${groupConfig.name}...`);

    try {
      const result = await sendTelegramMessage(token, notifyConfig.chat_id, msg);
      if (result.ok) {
        console.log('  Enviado com sucesso.');
      } else {
        console.log(`  Erro: ${result.description || 'Unknown'}`);
      }
    } catch (err) {
      console.log(`  Erro ao enviar: ${err.message}`);
    }
  }
  console.log('');
}

// ── Pipeline ────────────────────────────────────────────────────

async function cmdPipeline() {
  const start = Date.now();
  const timestamp = new Date().toLocaleString('pt-BR');

  console.log('\n  PIPELINE AUTOMATICO — Squad WhatsApp Intelligence');
  console.log(`  ${timestamp}`);
  console.log('  ================================================\n');

  console.log('  [1/3] Coletando mensagens...');
  try { await cmdListen('all'); } catch (err) { console.log(`  Erro: ${err.message}`); }

  console.log('  [2/3] Analisando dados...');
  try { await cmdAnalyze('all'); } catch (err) { console.log(`  Erro: ${err.message}`); }

  console.log('  [3/3] Enviando notificacoes...');
  try { await cmdNotify('all'); } catch (err) { console.log(`  Erro: ${err.message}`); }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Pipeline completo em ${elapsed}s`);
  console.log('  ================================================\n');

  // Log execution
  const logPath = path.join(DATA_DIR, 'pipeline-log.json');
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
  log.push({ timestamp: new Date().toISOString(), elapsed_s: parseFloat(elapsed) });
  if (log.length > 30) log.splice(0, log.length - 30);
  ensureDir(DATA_DIR);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

async function cmdDisconnect() {
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    console.log('\n  Sessao WhatsApp removida.');
    console.log('  Execute: connect para reconectar.\n');
  } else {
    console.log('\n  Nenhuma sessao ativa.\n');
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const param = args[1] || 'all';

  switch (command) {
    case 'connect':
      await cmdConnect();
      break;

    case 'status':
      await cmdStatus();
      break;

    case 'groups':
      await cmdGroups();
      break;

    case 'listen':
      await cmdListen(param);
      break;

    case 'analyze':
      await cmdAnalyze(param);
      break;

    case 'export':
      await cmdExport(param);
      break;

    case 'notify':
      await cmdNotify(param);
      break;

    case 'pipeline':
      await cmdPipeline();
      break;

    case 'disconnect':
      await cmdDisconnect();
      break;

    default:
      console.log(`
  SQUAD WHATSAPP INTELLIGENCE — CLI

  Uso:
    node bin/whatsapp-monitor.js connect               Conectar WhatsApp (QR Code)
    node bin/whatsapp-monitor.js status                Status da conexao
    node bin/whatsapp-monitor.js groups                Lista grupos monitorados
    node bin/whatsapp-monitor.js listen [group|all]    Coleta mensagens
    node bin/whatsapp-monitor.js analyze [group|all]   Analise inteligente completa
    node bin/whatsapp-monitor.js export [group|all]    Gera relatorio HTML
    node bin/whatsapp-monitor.js notify [group|all]    Envia relatorio ao operador
    node bin/whatsapp-monitor.js pipeline              Pipeline completo automatico
    node bin/whatsapp-monitor.js disconnect             Remove sessao

  Grupos: use "groups" para ver os disponiveis
`);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
