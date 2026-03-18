#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i > 0) env[t.slice(0, i)] = t.slice(i + 1);
});

const SUPABASE_DB_URL = env.SUPABASE_DB_URL;
if (!SUPABASE_DB_URL) {
  console.error('SUPABASE_DB_URL nao encontrada no .env');
  process.exit(1);
}

const url = new URL(SUPABASE_DB_URL);
const config = {
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1) || 'postgres',
  user: url.username,
  password: decodeURIComponent(url.password),
};

let pg;
try {
  pg = require('pg');
} catch (_e) {
  console.log('Modulo "pg" nao encontrado. Instalando...');
  const { execSync } = require('child_process');
  execSync('npm install pg --no-save', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  pg = require('pg');
}

const migrations = [
  '20260315100001_create_whatsapp_schema.sql',
  '20260315100002_create_whatsapp_tables.sql',
  '20260315100003_create_whatsapp_rls.sql',
];

async function main() {
  console.log('\n  Aplicando migrations do Schema WhatsApp...\n');

  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('  Conectado ao Supabase PostgreSQL\n');

    for (const file of migrations) {
      const filePath = path.resolve(__dirname, '..', 'supabase', 'migrations', file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  Executando: ${file}`);
      try {
        await client.query(sql);
        console.log('  OK\n');
      } catch (err) {
        console.error(`  ERRO: ${err.message}\n`);
      }
    }

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'whatsapp'
      ORDER BY table_name;
    `);

    console.log('  Tabelas no schema whatsapp:');
    result.rows.forEach(row => {
      console.log(`    - whatsapp.${row.table_name}`);
    });
    console.log(`\n  Total: ${result.rows.length} tabelas\n`);

  } catch (err) {
    console.error('  Erro de conexao:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
