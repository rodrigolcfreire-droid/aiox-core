#!/usr/bin/env node
'use strict';

/**
 * av-server.js — Inicia o API server da Central Audiovisual
 *
 * Usage: node bin/av-server.js [--port 3456]
 */

const path = require('path');
const fs = require('fs');

// Minimal .env loader (zero deps) — loads AIOS_PASSWORD, OPENAI_API_KEY, etc.
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { createServer, DEFAULT_PORT } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'api-server'));

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : DEFAULT_PORT;

createServer(port);
