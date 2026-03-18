#!/usr/bin/env node
'use strict';

const https = require('https');
const path = require('path');

// Load .env
const envPath = path.resolve(__dirname, '..', '.env');
const fs = require('fs');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const BOTS = {
  IRISTHAIZE: process.env.TELEGRAM_BOT_IRISTHAIZE,
  PROFESSOR: process.env.TELEGRAM_BOT_PROFESSOR,
  SUHAVIATOR: process.env.TELEGRAM_BOT_SUHAVIATOR,
  CAIO_ROLETA: process.env.TELEGRAM_BOT_CAIO_ROLETA,
};

function apiCall(token, method) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Buscando chat_ids de todos os bots...\n');

  const results = {};

  for (const [name, token] of Object.entries(BOTS)) {
    if (!token) {
      console.log(`  ${name}: token nao configurado`);
      continue;
    }

    try {
      const updates = await apiCall(token, 'getUpdates');
      if (!updates.ok) {
        console.log(`  ${name}: erro - ${JSON.stringify(updates)}`);
        continue;
      }

      const chats = new Map();
      for (const u of updates.result) {
        const msg = u.message || u.my_chat_member;
        if (msg && msg.chat) {
          const c = msg.chat;
          chats.set(c.id, {
            id: c.id,
            type: c.type,
            name: c.first_name || c.title || 'unknown',
          });
        }
      }

      if (chats.size === 0) {
        console.log(`  ${name}: nenhum chat encontrado (${updates.result.length} updates)`);
      } else {
        for (const [chatId, info] of chats) {
          console.log(`  ${name}: chat_id=${chatId} (${info.name}, ${info.type})`);
          if (info.type === 'private') {
            results[name] = chatId;
          }
        }
      }
    } catch (err) {
      console.log(`  ${name}: erro - ${err.message}`);
    }
  }

  console.log('\n--- Resultado ---');
  console.log(JSON.stringify(results, null, 2));

  // Save to .env if we found chat_ids
  if (Object.keys(results).length > 0) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    const envMap = {
      IRISTHAIZE: 'TELEGRAM_CHAT_IRISTHAIZE',
      PROFESSOR: 'TELEGRAM_CHAT_PROFESSOR',
      SUHAVIATOR: 'TELEGRAM_CHAT_SUHAVIATOR',
      CAIO_ROLETA: 'TELEGRAM_CHAT_CAIO_ROLETA',
    };

    for (const [botName, chatId] of Object.entries(results)) {
      const envKey = envMap[botName];
      if (!envKey) continue;

      const regex = new RegExp(`^${envKey}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${envKey}=${chatId}`);
        console.log(`  Atualizado ${envKey}=${chatId}`);
      } else {
        envContent += `\n${envKey}=${chatId}`;
        console.log(`  Adicionado ${envKey}=${chatId}`);
      }
    }

    fs.writeFileSync(envPath, envContent);
    console.log('\n.env atualizado com chat_ids');
  }
}

main().catch(console.error);
