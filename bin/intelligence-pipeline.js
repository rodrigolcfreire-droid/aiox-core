#!/usr/bin/env node
'use strict';

/**
 * intelligence-pipeline.js — Pipeline unificado Telegram + WhatsApp
 *
 * Roda ambos os pipelines em sequencia:
 *   1. Telegram: listen all → analyze all → export all → notify all
 *   2. WhatsApp: listen all → analyze all → export all → notify all
 *
 * Usado pelo cron (launchd) para execucao automatica.
 *
 * CLI First: Este script e a fonte da verdade para o pipeline unificado.
 */

const { execSync } = require('child_process');
const path = require('path');

const BIN_DIR = __dirname;
const NODE = process.execPath;

function runScript(script, command) {
  const scriptPath = path.join(BIN_DIR, script);
  console.log(`\n  >> ${script} ${command}`);
  try {
    execSync(`"${NODE}" "${scriptPath}" ${command}`, {
      stdio: 'inherit',
      cwd: path.resolve(BIN_DIR, '..'),
      timeout: 300000, // 5 min per command
    });
  } catch (err) {
    console.log(`  Erro em ${script} ${command}: ${err.message}`);
  }
}

async function main() {
  const start = Date.now();
  const timestamp = new Date().toLocaleString('pt-BR');

  console.log('');
  console.log('  ================================================================');
  console.log('  INTELLIGENCE PIPELINE UNIFICADO — Telegram + WhatsApp');
  console.log(`  ${timestamp}`);
  console.log('  ================================================================');

  // Telegram pipeline
  console.log('\n  ── TELEGRAM ──────────────────────────────────────────');
  runScript('telegram-monitor.js', 'pipeline');

  // WhatsApp pipeline (only if session exists)
  const fs = require('fs');
  const sessionDir = path.resolve(BIN_DIR, '..', '.aiox', 'whatsapp', 'session', 'Default');
  if (fs.existsSync(sessionDir)) {
    console.log('\n  ── WHATSAPP ──────────────────────────────────────────');
    runScript('whatsapp-monitor.js', 'pipeline');
  } else {
    console.log('\n  ── WHATSAPP ──────────────────────────────────────────');
    console.log('  WhatsApp nao conectado. Pulando.');
    console.log('  Para conectar: node bin/whatsapp-monitor.js connect');
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n  ================================================================');
  console.log(`  Pipeline unificado completo em ${elapsed}s`);
  console.log('  ================================================================\n');
}

main();
