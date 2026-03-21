#!/usr/bin/env node
'use strict';

/**
 * security-bot.js — Telegram command bot for remote AIOS control
 *
 * Listens for commands via Telegram and executes actions:
 * /status — security report
 * /bloquear — kill cloudflare tunnel (block external access)
 * /liberar — restart cloudflare tunnel
 * /conexoes — show active network connections
 * /trocarsenha <nova> — change dashboard password
 * /servidor — server status (uptime, memory, processes)
 * /help — list commands
 *
 * ONLY responds to authorized chat ID (owner).
 */

const https = require('https');
const { execSync } = require('child_process');
const { getSecurityStatus, getNetworkConnections } = require('./security-monitor');
const { sendTelegram, sendDailyReport } = require('./security-alerts');

const BOT_TOKEN = '8762480661:AAFB5ZhzTd5seo5QpyfuWR6j6FVkcHDtHGY';
const OWNER_CHAT_ID = 6912128011;

let lastUpdateId = 0;
let pollingInterval = null;

/**
 * Get updates from Telegram (long polling).
 */
function getUpdates() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, result: [] });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, result: [] }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, result: [] }); });
    req.end();
  });
}

/**
 * Process a command from Telegram.
 */
async function processCommand(text, chatId) {
  // Security: only respond to owner
  if (chatId !== OWNER_CHAT_ID) {
    await sendTelegram('⛔ Acesso negado. Voce nao tem permissao.');
    return;
  }

  const cmd = text.trim().toLowerCase().split(' ')[0];
  const args = text.trim().split(' ').slice(1).join(' ');

  switch (cmd) {
    case '/start':
    case '/help':
      await sendTelegram(
        '🛡️ <b>AIOS Security Bot</b>\n\n' +
        'Comandos disponiveis:\n\n' +
        '/status — Relatorio de seguranca\n' +
        '/bloquear — Bloquear acesso externo\n' +
        '/liberar — Liberar acesso externo\n' +
        '/conexoes — Conexoes de rede ativas\n' +
        '/trocarsenha &lt;nova&gt; — Trocar senha do dashboard\n' +
        '/servidor — Status do servidor\n' +
        '/relatorio — Enviar relatorio completo\n' +
        '/tunnel — Status do Cloudflare Tunnel\n' +
        '/help — Esta mensagem'
      );
      break;

    case '/status':
      await handleStatus();
      break;

    case '/bloquear':
      await handleBlock();
      break;

    case '/liberar':
      await handleUnblock();
      break;

    case '/conexoes':
      await handleConnections();
      break;

    case '/trocarsenha':
      await handleChangePassword(args);
      break;

    case '/servidor':
      await handleServerStatus();
      break;

    case '/relatorio':
      await sendDailyReport();
      break;

    case '/tunnel':
      await handleTunnelStatus();
      break;

    default:
      await sendTelegram('❓ Comando nao reconhecido. Use /help para ver comandos.');
  }
}

async function handleStatus() {
  const status = getSecurityStatus();
  const emoji = status.status === 'secure' ? '🟢' : status.status === 'warning' ? '🟡' : '🔴';

  let msg = `${emoji} <b>Status: ${status.status.toUpperCase()}</b>\n\n`;
  msg += `📊 Acessos (1h): ${status.stats.totalAccessLastHour}\n`;
  msg += `🌐 IPs unicos: ${status.stats.uniqueIPs}\n`;
  msg += `⚠️ Rate limits: ${status.stats.rateLimitHits}\n`;
  msg += `🚫 Bloqueados: ${status.stats.blockedRequests}\n`;
  msg += `🔥 Firewall: ${status.firewall.enabled ? '✅' : '❌'}\n`;
  msg += `⏱️ Uptime: ${status.stats.uptime}\n`;
  msg += `💾 RAM: ${status.stats.memoryMB} MB`;

  if (status.alerts.length > 0) {
    msg += '\n\n⚠️ Alertas:\n';
    for (const a of status.alerts) {
      msg += `• ${a.message}\n`;
    }
  }

  await sendTelegram(msg);
}

async function handleBlock() {
  try {
    execSync('pkill -f "cloudflared tunnel run" 2>/dev/null', { stdio: 'pipe' });
    await sendTelegram(
      '🔴 <b>ACESSO EXTERNO BLOQUEADO</b>\n\n' +
      'Cloudflare Tunnel desligado.\n' +
      'https://uxcentrodecomando.com esta OFFLINE.\n\n' +
      'Use /liberar para reativar.'
    );
  } catch {
    await sendTelegram('⚠️ Tunnel ja estava parado ou erro ao parar.');
  }
}

async function handleUnblock() {
  try {
    // Check if already running
    try {
      execSync('pgrep -f "cloudflared tunnel run"', { stdio: 'pipe' });
      await sendTelegram('✅ Tunnel ja esta rodando.');
      return;
    } catch {
      // Not running — start it
    }

    execSync('nohup cloudflared tunnel run aios > /tmp/cloudflared.log 2>&1 &', { stdio: 'pipe' });

    // Wait and verify
    await new Promise(r => setTimeout(r, 3000));

    await sendTelegram(
      '🟢 <b>ACESSO EXTERNO LIBERADO</b>\n\n' +
      'Cloudflare Tunnel reativado.\n' +
      'https://uxcentrodecomando.com esta ONLINE.'
    );
  } catch (err) {
    await sendTelegram(`❌ Erro ao liberar: ${err.message}`);
  }
}

async function handleConnections() {
  const network = getNetworkConnections();

  let msg = `🌐 <b>CONEXOES DE REDE</b>\n\n`;
  msg += `↑ Saida: ${network.outbound}\n`;
  msg += `↓ Entrada: ${network.inbound}\n\n`;

  if (network.inbound > 0) {
    msg += '🔴 <b>Conexoes de entrada:</b>\n';
    for (const c of network.inboundDetails) {
      msg += `• ${c.remoteIP}:${c.remotePort} → :${c.localPort}\n`;
    }
  }

  const top5 = network.connections.slice(0, 8);
  if (top5.length > 0) {
    msg += '\nTop conexoes:\n';
    for (const c of top5) {
      const dir = c.direction === 'inbound' ? '↓' : '↑';
      msg += `${dir} ${c.remoteIP}:${c.remotePort}\n`;
    }
  }

  await sendTelegram(msg);
}

async function handleChangePassword(newPassword) {
  if (!newPassword || newPassword.length < 4) {
    await sendTelegram('❌ Senha deve ter pelo menos 4 caracteres.\nUso: /trocarsenha minhanovasenha');
    return;
  }

  try {
    const fs = require('fs');
    const keysPath = require('os').homedir() + '/.config/aios/keys';
    let content = fs.existsSync(keysPath) ? fs.readFileSync(keysPath, 'utf8') : '';

    // Remove old password line if exists
    content = content.split('\n').filter(l => !l.includes('AIOS_PASSWORD')).join('\n');
    content += `\nexport AIOS_PASSWORD="${newPassword}"\n`;
    fs.writeFileSync(keysPath, content.trim() + '\n');

    // Update in current process
    process.env.AIOS_PASSWORD = newPassword;

    await sendTelegram(
      '✅ <b>SENHA ALTERADA</b>\n\n' +
      'Nova senha configurada.\n' +
      '⚠️ Reinicie o servidor para aplicar:\n' +
      '<code>Sera aplicada no proximo restart</code>'
    );
  } catch (err) {
    await sendTelegram(`❌ Erro ao trocar senha: ${err.message}`);
  }
}

async function handleServerStatus() {
  const os = require('os');

  let msg = `⚙️ <b>STATUS DO SERVIDOR</b>\n\n`;
  msg += `🖥️ Host: ${os.hostname()}\n`;
  msg += `💻 CPUs: ${os.cpus().length}\n`;
  msg += `💾 RAM: ${(os.freemem() / 1073741824).toFixed(1)}/${(os.totalmem() / 1073741824).toFixed(1)} GB livres\n`;
  msg += `⏱️ Uptime sistema: ${Math.floor(os.uptime() / 3600)}h\n`;
  msg += `⏱️ Uptime Node: ${Math.floor(process.uptime())}s\n`;
  msg += `📦 PID: ${process.pid}\n`;
  msg += `🔧 Node: ${process.version}\n`;

  // Check AV server
  try {
    execSync('curl -s http://localhost:3456/api/health', { stdio: 'pipe', timeout: 3000 });
    msg += `\n🟢 AV Server: ATIVO (porta 3456)`;
  } catch {
    msg += `\n🔴 AV Server: INATIVO`;
  }

  // Check tunnel
  try {
    execSync('pgrep -f "cloudflared tunnel run"', { stdio: 'pipe' });
    msg += `\n🟢 Tunnel: ATIVO`;
  } catch {
    msg += `\n🔴 Tunnel: INATIVO`;
  }

  await sendTelegram(msg);
}

async function handleTunnelStatus() {
  let msg = `🌐 <b>CLOUDFLARE TUNNEL</b>\n\n`;

  try {
    execSync('pgrep -f "cloudflared tunnel run"', { stdio: 'pipe' });
    msg += `🟢 Status: <b>ATIVO</b>\n`;
    msg += `🔗 https://uxcentrodecomando.com\n`;
    msg += `🔗 https://av.uxcentrodecomando.com\n`;
    msg += `🔗 https://api.uxcentrodecomando.com\n`;
  } catch {
    msg += `🔴 Status: <b>INATIVO</b>\n`;
    msg += `Use /liberar para reativar.`;
  }

  await sendTelegram(msg);
}

/**
 * Start polling for Telegram commands.
 */
function startSecurityBot() {
  console.log('  Security Bot: listening for Telegram commands');

  async function poll() {
    try {
      const updates = await getUpdates();
      if (updates.ok && updates.result.length > 0) {
        for (const update of updates.result) {
          lastUpdateId = update.update_id;
          if (update.message && update.message.text) {
            await processCommand(update.message.text, update.message.chat.id);
          }
        }
      }
    } catch {
      // Silent fail — will retry
    }
  }

  // Poll every 3 seconds
  pollingInterval = setInterval(poll, 3000);
  // Initial poll
  poll();
}

function stopSecurityBot() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

module.exports = {
  startSecurityBot,
  stopSecurityBot,
  processCommand,
};
