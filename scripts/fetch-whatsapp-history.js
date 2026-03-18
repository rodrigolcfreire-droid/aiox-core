#!/usr/bin/env node
'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, '..', '.aiox', 'whatsapp', 'session');
const DATA_DIR = path.resolve(__dirname, '..', '.aiox', 'whatsapp');
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'groups-config.json'), 'utf8'));
const slug = Object.keys(config)[0];
const groupConfig = config[slug];

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('ready', async () => {
  console.log('Conectado. Buscando historico completo...');
  const chats = await client.getChats();
  const group = chats.find(c => c.id._serialized === groupConfig.id);

  if (!group) {
    console.log('Grupo nao encontrado');
    await client.destroy();
    process.exit(1);
  }

  // Fetch max messages
  const rawMessages = await group.fetchMessages({ limit: 5000 });
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

  if (messages.length > 0) {
    const oldest = new Date(messages[0].date * 1000);
    const newest = new Date(messages[messages.length - 1].date * 1000);
    const days = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24));
    console.log('Total mensagens:', messages.length);
    console.log('Mais antiga:', oldest.toISOString().split('T')[0]);
    console.log('Mais recente:', newest.toISOString().split('T')[0]);
    console.log('Periodo:', days, 'dias');
  }

  const filePath = path.join(DATA_DIR, slug + '-messages.json');
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
  console.log('Salvo em:', filePath);

  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', (msg) => {
  console.log('Auth falhou:', msg);
  process.exit(1);
});

console.log('Iniciando WhatsApp Web...');
client.initialize();

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 180000);
