#!/usr/bin/env node
'use strict';

/**
 * av-auth.js — Google Drive OAuth with local server callback
 *
 * Abre o navegador, captura o code automaticamente via servidor local.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CREDS_PATH = path.resolve(__dirname, '..', '.aiox', 'audiovisual', 'drive-credentials.json');
const TOKEN_PATH = path.resolve(__dirname, '..', '.aiox', 'audiovisual', 'drive-token.json');
const PORT = 3457;

function main() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error('  Credentials not found at:', CREDS_PATH);
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const config = creds.installed || creds.web;
  const redirectUri = `http://localhost:${PORT}`;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${config.client_id}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive')}&` +
    `access_type=offline&` +
    `prompt=consent`;

  // Start local server to capture callback
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Erro: code nao encontrado</h1>');
      return;
    }

    // Exchange code for token
    const body = new URLSearchParams({
      code,
      client_id: config.client_id,
      client_secret: config.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const tokenReq = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (tokenRes) => {
      let data = '';
      tokenRes.on('data', chunk => { data += chunk; });
      tokenRes.on('end', () => {
        if (tokenRes.statusCode !== 200) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>Erro na autenticacao</h1><pre>${data}</pre>`);
          console.error('  Token error:', data);
          server.close();
          process.exit(1);
          return;
        }

        const token = JSON.parse(data);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
          <body style="background:#0a0e1a;color:#34d399;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
              <h1 style="font-size:48px;">Autenticado!</h1>
              <p style="color:#94a3b8;font-size:18px;">Google Drive conectado ao AIOS. Pode fechar esta aba.</p>
            </div>
          </body>
          </html>
        `);

        console.log('');
        console.log('  ================================================================');
        console.log('  GOOGLE DRIVE AUTENTICADO COM SUCESSO');
        console.log('  Token salvo em:', TOKEN_PATH);
        console.log('  ================================================================');
        console.log('');

        setTimeout(() => { server.close(); process.exit(0); }, 2000);
      });
    });

    tokenReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Erro</h1><pre>${err.message}</pre>`);
      server.close();
      process.exit(1);
    });

    tokenReq.write(body);
    tokenReq.end();
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('  ================================================================');
    console.log('  GOOGLE DRIVE — Autenticacao');
    console.log(`  Servidor local em http://localhost:${PORT}`);
    console.log('  Abrindo navegador...');
    console.log('  ================================================================');
    console.log('');

    // Open browser
    try {
      execSync(`open "${authUrl}"`);
    } catch {
      console.log('  Abra manualmente:', authUrl);
    }
  });
}

main();
