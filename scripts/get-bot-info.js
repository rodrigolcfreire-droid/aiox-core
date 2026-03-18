#!/usr/bin/env node
'use strict';
const https = require('https');
const token = process.argv[2];
if (!token) { console.log('Usage: node get-bot-info.js <token>'); process.exit(1); }
https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const r = JSON.parse(d);
    if (r.ok) {
      console.log(`Bot: @${r.result.username}`);
      console.log(`Nome: ${r.result.first_name}`);
    } else {
      console.log('Erro:', r.description);
    }
  });
});
