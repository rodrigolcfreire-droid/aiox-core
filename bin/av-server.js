#!/usr/bin/env node
'use strict';

/**
 * av-server.js — Inicia o API server da Central Audiovisual
 *
 * Usage: node bin/av-server.js [--port 3456]
 */

const path = require('path');
const { createServer, DEFAULT_PORT } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'api-server'));

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : DEFAULT_PORT;

createServer(port);
