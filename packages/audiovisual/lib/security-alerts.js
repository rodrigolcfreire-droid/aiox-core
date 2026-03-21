#!/usr/bin/env node
'use strict';

/**
 * security-alerts.js — Telegram security alerts + daily report
 *
 * Sends real-time intrusion alerts and daily security reports
 * via Telegram bot.
 */

const https = require('https');
const { getSecurityStatus, getNetworkConnections } = require('./security-monitor');

const BOT_TOKEN = '8762480661:AAFB5ZhzTd5seo5QpyfuWR6j6FVkcHDtHGY';
const CHAT_ID = '6912128011';

// Track sent alerts to avoid spam (max 1 alert per IP per 10 min)
const alertCooldown = new Map();
const COOLDOWN_MS = 600000; // 10 minutes

/**
 * Send a message via Telegram bot.
 */
function sendTelegram(text) {
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send intrusion alert (rate-limited per IP).
 */
async function sendIntrusionAlert(ip, port, details = '') {
  const key = `${ip}:${port}`;
  const now = Date.now();

  if (alertCooldown.has(key) && now - alertCooldown.get(key) < COOLDOWN_MS) {
    return; // Skip — already alerted recently
  }
  alertCooldown.set(key, now);

  const time = new Date().toLocaleTimeString('pt-BR');
  const msg = `🚨 <b>ALERTA DE SEGURANCA</b>\n\n` +
    `<b>Tentativa de acesso detectada!</b>\n\n` +
    `🔴 IP: <code>${ip}</code>\n` +
    `🔴 Porta: <code>${port}</code>\n` +
    `🕐 Hora: ${time}\n` +
    (details ? `📋 Detalhes: ${details}\n` : '') +
    `\n⚡ Acao: Conexao bloqueada pelo firewall`;

  try {
    await sendTelegram(msg);
  } catch (err) {
    console.error(`Failed to send Telegram alert: ${err.message}`);
  }
}

/**
 * Send authorized access alert (green — login successful).
 */
async function sendAccessAlert(ip, details = '') {
  const key = `access:${ip}`;
  const now = Date.now();

  if (alertCooldown.has(key) && now - alertCooldown.get(key) < COOLDOWN_MS) {
    return;
  }
  alertCooldown.set(key, now);

  const time = new Date().toLocaleTimeString('pt-BR');
  const msg = `🟢 <b>ACESSO AUTORIZADO</b>\n\n` +
    `✅ Login bem-sucedido\n\n` +
    `🟢 IP: <code>${ip}</code>\n` +
    `🕐 Hora: ${time}\n` +
    (details ? `📋 ${details}\n` : '');

  try {
    await sendTelegram(msg);
  } catch (err) {
    console.error(`Failed to send access alert: ${err.message}`);
  }
}

/**
 * Send rate limit alert.
 */
async function sendRateLimitAlert(ip, count) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();

  if (alertCooldown.has(key) && now - alertCooldown.get(key) < COOLDOWN_MS) {
    return;
  }
  alertCooldown.set(key, now);

  const msg = `⚠️ <b>RATE LIMIT</b>\n\n` +
    `IP <code>${ip}</code> excedeu o limite de requests.\n` +
    `Total: ${count} requests/min\n` +
    `Limite: 30/min`;

  try {
    await sendTelegram(msg);
  } catch (err) {
    console.error(`Failed to send rate limit alert: ${err.message}`);
  }
}

/**
 * Generate and send daily security report.
 */
async function sendDailyReport() {
  const status = getSecurityStatus();
  const network = getNetworkConnections();

  const statusEmoji = status.status === 'secure' ? '🟢' : status.status === 'warning' ? '🟡' : '🔴';
  const statusText = status.status === 'secure' ? 'SEGURO' : status.status === 'warning' ? 'ATENCAO' : 'RISCO';

  const date = new Date().toLocaleDateString('pt-BR');

  let msg = `🛡️ <b>RELATORIO DIARIO DE SEGURANCA</b>\n`;
  msg += `📅 ${date}\n\n`;

  msg += `${statusEmoji} Status: <b>${statusText}</b>\n\n`;

  msg += `📊 <b>Estatisticas (ultima hora):</b>\n`;
  msg += `• Acessos: ${status.stats.totalAccessLastHour}\n`;
  msg += `• IPs unicos: ${status.stats.uniqueIPs}\n`;
  msg += `• Rate limits: ${status.stats.rateLimitHits}\n`;
  msg += `• Bloqueados: ${status.stats.blockedRequests}\n\n`;

  msg += `🔥 <b>Firewall:</b> ${status.firewall.enabled ? '✅ Ativado' : '❌ DESATIVADO'}\n\n`;

  msg += `🌐 <b>Rede:</b>\n`;
  msg += `• Saida: ${network.outbound} conexoes\n`;
  msg += `• Entrada: ${network.inbound} conexoes\n\n`;

  msg += `⚙️ <b>Servicos:</b>\n`;
  for (const s of status.services) {
    msg += `• ${s.name}: ${s.status === 'active' ? '✅' : '❌'} ${s.version || ''}\n`;
  }

  if (status.alerts.length > 0) {
    msg += `\n⚠️ <b>Alertas:</b>\n`;
    for (const a of status.alerts) {
      msg += `• ${a.level === 'critical' ? '🚨' : '⚠️'} ${a.message}\n`;
    }
  }

  msg += `\n💾 RAM: ${status.system.freeMemoryGB}/${status.system.totalMemoryGB} GB livres`;
  msg += `\n⏱️ Uptime: ${status.stats.uptime}`;

  try {
    await sendTelegram(msg);
    console.log('  Daily security report sent via Telegram');
  } catch (err) {
    console.error(`Failed to send daily report: ${err.message}`);
  }
}

/**
 * Schedule daily report at 07:00 BRT.
 */
function scheduleDailyReport() {
  function scheduleNext() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(7, 0, 0, 0); // 07:00

    // If already past 07:00 today, schedule for tomorrow
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    const ms = target.getTime() - now.getTime();
    console.log(`  Security report scheduled for ${target.toLocaleString('pt-BR')} (in ${Math.round(ms / 60000)} min)`);

    setTimeout(() => {
      sendDailyReport();
      // Schedule next day
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}

/**
 * Start the security alert system.
 */
function startSecurityAlerts() {
  scheduleDailyReport();
  console.log('  Security alerts: Telegram notifications active');
  console.log(`  Bot: @AIOSSEGURANCATRETRIS_BOT → Chat: ${CHAT_ID}`);
}

module.exports = {
  sendTelegram,
  sendIntrusionAlert,
  sendAccessAlert,
  sendRateLimitAlert,
  sendDailyReport,
  scheduleDailyReport,
  startSecurityAlerts,
};
