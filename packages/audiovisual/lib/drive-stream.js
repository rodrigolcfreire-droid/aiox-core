#!/usr/bin/env node
'use strict';

/**
 * drive-stream.js — Google Drive file streaming via API
 *
 * Downloads files from Google Drive using OAuth2 token.
 * Supports full download and audio-only extraction.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { AV_DIR } = require('./constants');

const TOKEN_PATH = path.join(AV_DIR, 'drive-token.json');
const CREDS_PATH = path.join(AV_DIR, 'drive-credentials.json');

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'Google Drive nao autenticado.\n' +
      'Execute: node bin/av-auth.js',
    );
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function refreshToken() {
  const token = loadToken();
  if (!token.refresh_token) throw new Error('No refresh token. Re-authenticate: node bin/av-auth.js');

  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const config = creds.installed || creds.web;

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Refresh failed: ' + data));
        const newToken = { ...token, ...JSON.parse(data) };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(newToken, null, 2));
        resolve(newToken);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractFileId(driveUrl) {
  const match = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const paramMatch = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (paramMatch) return paramMatch[1];
  // Maybe it's already a file ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(driveUrl)) return driveUrl;
  throw new Error('Could not extract file ID from: ' + driveUrl);
}

function getFileMetadata(fileId, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${fileId}?fields=name,size,mimeType`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('TOKEN_EXPIRED'));
        if (res.statusCode !== 200) return reject(new Error('Drive API: ' + data));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(fileId, destPath, token) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let totalBytes = 0;

    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${fileId}?alt=media`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    }, (res) => {
      if (res.statusCode === 401) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error('TOKEN_EXPIRED'));
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => reject(new Error(`Drive download ${res.statusCode}: ${data}`)));
        return;
      }

      const totalSize = parseInt(res.headers['content-length'] || '0');

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalSize > 0) {
          const pct = ((totalBytes / totalSize) * 100).toFixed(0);
          process.stdout.write(`\r  Download: ${pct}% (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('');
        resolve(destPath);
      });
    });

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });

    req.end();
  });
}

async function downloadFromDrive(driveUrl, destPath) {
  let token = loadToken();
  const fileId = extractFileId(driveUrl);

  // Get metadata
  let metadata;
  try {
    metadata = await getFileMetadata(fileId, token);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      console.log('  Token expirado, renovando...');
      token = await refreshToken();
      metadata = await getFileMetadata(fileId, token);
    } else throw err;
  }

  console.log(`  Arquivo: ${metadata.name}`);
  console.log(`  Tamanho: ${(parseInt(metadata.size) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Tipo: ${metadata.mimeType}`);

  // Download
  try {
    await downloadFile(fileId, destPath, token);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      token = await refreshToken();
      await downloadFile(fileId, destPath, token);
    } else throw err;
  }

  return { metadata, filePath: destPath };
}

async function extractAudioFromDrive(driveUrl, audioDestPath) {
  let token = loadToken();
  const fileId = extractFileId(driveUrl);

  // Get metadata first
  let metadata;
  try {
    metadata = await getFileMetadata(fileId, token);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      token = await refreshToken();
      metadata = await getFileMetadata(fileId, token);
    } else throw err;
  }

  console.log(`  Arquivo: ${metadata.name} (${(parseInt(metadata.size) / 1024 / 1024).toFixed(1)} MB)`);

  // Download to temp, then extract audio
  const tempPath = audioDestPath + '.tmp.mov';
  console.log('  Baixando video...');
  try {
    await downloadFile(fileId, tempPath, token);
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      token = await refreshToken();
      await downloadFile(fileId, tempPath, token);
    } else throw err;
  }

  // Extract audio only
  console.log('  Extraindo audio...');
  try {
    execSync(`ffmpeg -y -i "${tempPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioDestPath}"`, {
      stdio: 'pipe', timeout: 300000,
    });
  } catch (err) {
    throw new Error('Falha ao extrair audio: ' + err.message);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  return { metadata, audioPath: audioDestPath };
}

module.exports = {
  loadToken,
  refreshToken,
  extractFileId,
  getFileMetadata,
  downloadFile,
  downloadFromDrive,
  extractAudioFromDrive,
};
