#!/usr/bin/env node
'use strict';

/**
 * drive-upload.js — Google Drive upload integration
 * Story: AV-9.4
 *
 * Uploads output files to Google Drive using OAuth2.
 * Creates folder structure automatically.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getProjectDir, loadProject } = require('./project');
const { listOutputs } = require('./output-manager');
const { AV_DIR } = require('./constants');

const CREDENTIALS_PATH = path.join(AV_DIR, 'drive-credentials.json');
const TOKEN_PATH = path.join(AV_DIR, 'drive-token.json');

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'Google Drive credentials not found.\n' +
      `Place your credentials.json at: ${CREDENTIALS_PATH}\n` +
      'Get it from: https://console.cloud.google.com/apis/credentials'
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
}

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(token) {
  fs.mkdirSync(AV_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

function getAuthUrl() {
  const creds = loadCredentials();
  const clientId = creds.installed ? creds.installed.client_id : creds.web.client_id;
  const redirectUri = creds.installed
    ? creds.installed.redirect_uris[0]
    : creds.web.redirect_uris[0];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function exchangeCode(code) {
  const creds = loadCredentials();
  const config = creds.installed || creds.web;

  const body = new URLSearchParams({
    code,
    client_id: config.client_id,
    client_secret: config.client_secret,
    redirect_uri: config.redirect_uris[0],
    grant_type: 'authorization_code',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Auth error: ${data}`));
        const token = JSON.parse(data);
        saveToken(token);
        resolve(token);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function driveRequest(method, apiPath, token, body = null, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': contentType,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Drive API ${res.statusCode}: ${data}`));
        resolve(data ? JSON.parse(data) : null);
      });
    });

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function createFolder(name, parentId, token) {
  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  return driveRequest('POST', '/drive/v3/files', token, metadata);
}

async function uploadFile(filePath, folderId, token) {
  const filename = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  // Step 1: Initiate resumable upload
  const metadata = { name: filename };
  if (folderId) metadata.parents = [folderId];

  const initRes = await driveRequest(
    'POST',
    '/upload/drive/v3/files?uploadType=resumable',
    token,
    metadata
  );

  // For simplicity, use simple upload for files < 5MB
  // For larger files, a resumable upload would be needed
  const boundary = '----UploadBoundary' + Date.now();
  const metadataPart = JSON.stringify({ name: filename, parents: folderId ? [folderId] : [] });
  const fileData = fs.readFileSync(filePath);

  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`,
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ];

  const bodyParts = [
    Buffer.from(parts[0]),
    Buffer.from(parts[1]),
    fileData,
    Buffer.from(`\r\n--${boundary}--`),
  ];
  const fullBody = Buffer.concat(bodyParts);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Upload error: ${data}`));
        resolve(JSON.parse(data));
      });
    });

    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function publishProject(projectId) {
  const token = loadToken();
  if (!token) {
    throw new Error(
      'Google Drive not authenticated.\n' +
      'Run: node bin/av-drive.js auth'
    );
  }

  const project = loadProject(projectId);
  const outputs = listOutputs(projectId);

  if (outputs.length === 0) {
    throw new Error('No outputs to publish');
  }

  // Create project folder
  const folder = await createFolder(`AV-${project.name}-${project.id.slice(0, 8)}`, null, token);

  // Upload all outputs
  const uploaded = [];
  for (const output of outputs) {
    const file = await uploadFile(output.path, folder.id, token);
    uploaded.push({
      filename: output.filename,
      driveId: file.id,
      link: file.webViewLink,
    });
  }

  return {
    projectId,
    folderId: folder.id,
    uploaded,
    totalUploaded: uploaded.length,
    publishedAt: new Date().toISOString(),
  };
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  publishProject,
  createFolder,
  uploadFile,
  loadCredentials,
  loadToken,
  saveToken,
};
