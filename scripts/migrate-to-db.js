#!/usr/bin/env node

/**
 * AIOX Data Migration Script
 *
 * Migrates existing file-based data to the Supabase database:
 * - Brand rules (brand-foundation.yaml → memory.brand_rule)
 * - Knowledge base (aiox-kb.md → memory.knowledge_document)
 * - Workflow patterns (workflow-*.yaml → workflow.flow_definition)
 * - Briefing cycles (runs/_arquivo/* → briefing.cycle + briefing.briefing_doc)
 *
 * Usage: node scripts/migrate-to-db.js [--remote]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { DatabaseClient } = require('../.aiox-core/core/db/db-client');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Config
const IS_REMOTE = process.argv.includes('--remote');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[migrate-to-db] Missing required env var: ${name}`);
    console.error('[migrate-to-db] Set it in your .env or export before running.');
    process.exit(1);
  }
  return value;
}

const DB_CONFIG = IS_REMOTE
  ? {
    url: process.env.SUPABASE_URL || 'https://gfftqwmxiwejbimwgedc.supabase.co',
    serviceKey: requireEnv('SUPABASE_SERVICE_KEY'),
    mode: 'database',
  }
  : {
    url: process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321',
    serviceKey: requireEnv('SUPABASE_LOCAL_SERVICE_KEY'),
    mode: 'database',
  };

const db = new DatabaseClient(DB_CONFIG);

async function migrateBrandRules() {
  console.log('\n--- Migrating Brand Rules ---');
  const filePath = path.join(PROJECT_ROOT, 'squads/maquina-de-briefing/data/brand-foundation.yaml');
  const content = yaml.load(fs.readFileSync(filePath, 'utf8'));
  const memory = db.serviceSchema('memory');

  const rules = [];

  // Brand basics
  if (content.brand) {
    rules.push({
      brand_name: content.brand.name,
      rule_category: 'tone',
      rule_name: 'tone_of_voice_primary',
      rule_content: content.brand.tone_of_voice?.primary || '',
      priority: 10,
      is_negotiable: false,
    });
    rules.push({
      brand_name: content.brand.name,
      rule_category: 'positioning',
      rule_name: 'positioning_summary',
      rule_content: content.brand.positioning?.summary || '',
      priority: 10,
      is_negotiable: false,
    });
    if (content.brand.goals) {
      for (const goal of content.brand.goals) {
        rules.push({
          brand_name: content.brand.name,
          rule_category: 'goal',
          rule_name: goal.substring(0, 50),
          rule_content: goal,
          priority: 8,
          is_negotiable: false,
        });
      }
    }
  }

  // Non-negotiable pillars
  if (content.non_negotiable_pillars) {
    for (const pillar of content.non_negotiable_pillars) {
      rules.push({
        brand_name: content.brand?.name || 'UXGroup',
        rule_category: 'pillar',
        rule_name: pillar,
        rule_content: `Non-negotiable pillar: ${pillar}`,
        priority: 10,
        is_negotiable: false,
      });
    }
  }

  // Operations rules
  if (content.operations?.output_rules) {
    const or = content.operations.output_rules;
    rules.push({
      brand_name: content.brand?.name || 'UXGroup',
      rule_category: 'operations',
      rule_name: 'output_rules',
      rule_content: JSON.stringify(or),
      priority: 9,
      is_negotiable: false,
    });
  }

  if (rules.length > 0) {
    const result = await memory.create('brand_rule', rules);
    console.log(`  Inserted ${result.data.length} brand rules`);
  }
}

async function migrateKnowledgeBase() {
  console.log('\n--- Migrating Knowledge Base ---');
  const filePath = path.join(PROJECT_ROOT, '.aiox-core/data/aiox-kb.md');
  const content = fs.readFileSync(filePath, 'utf8');
  const memory = db.serviceSchema('memory');

  const result = await memory.create('knowledge_document', {
    domain: 'framework',
    title: 'AIOX Knowledge Base',
    content: content,
    content_type: 'markdown',
    tags: ['framework', 'kb', 'core'],
    source_file: '.aiox-core/data/aiox-kb.md',
  });
  console.log(`  Inserted ${result.data.length} KB document(s)`);
}

async function migrateWorkflows() {
  console.log('\n--- Migrating Workflows ---');
  const workflow = db.serviceSchema('workflow');

  const files = [
    'workflow-patterns.yaml',
    'workflow-chains.yaml',
    'workflow-state-schema.yaml',
  ];

  for (const file of files) {
    const filePath = path.join(PROJECT_ROOT, '.aiox-core/data', file);
    if (!fs.existsSync(filePath)) continue;

    const content = yaml.load(fs.readFileSync(filePath, 'utf8'));
    const flowId = file.replace('.yaml', '');

    const result = await workflow.create('flow_definition', {
      flow_id: flowId,
      name: flowId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `Imported from ${file}`,
      flow_type: 'sequential',
      steps_json: content,
      config_json: { source_file: file },
    });
    console.log(`  Inserted flow: ${flowId} (${result.error ? 'ERROR: ' + result.error : 'OK'})`);
  }
}

async function migrateBriefingCycles() {
  console.log('\n--- Migrating Briefing Cycles ---');
  const briefing = db.serviceSchema('briefing');
  const archivePath = path.join(PROJECT_ROOT, 'squads/maquina-de-briefing/runs/_arquivo');

  if (!fs.existsSync(archivePath)) {
    console.log('  No archived cycles found');
    return;
  }

  const cycleDirs = fs.readdirSync(archivePath).filter((d) => {
    return fs.statSync(path.join(archivePath, d)).isDirectory();
  }).sort();

  console.log(`  Found ${cycleDirs.length} cycles`);

  for (const dir of cycleDirs) {
    const cyclePath = path.join(archivePath, dir);
    const parts = dir.match(/(\d{4}-\d{2}-\d{2})-ciclo-(\d+)/);
    if (!parts) continue;

    const cycleDate = parts[1];
    const cycleNumber = parseInt(parts[2], 10);

    // Create cycle
    const cycleResult = await briefing.create('cycle', {
      cycle_number: cycleNumber,
      cycle_date: cycleDate,
      status: 'completed',
      squad_id: 'maquina-de-briefing',
      config_json: { source_dir: dir },
    });

    if (cycleResult.error) {
      console.log(`  Cycle ${cycleNumber}: ERROR - ${cycleResult.error}`);
      continue;
    }

    const cycleId = cycleResult.data[0].id;

    // Read and insert docs
    const docFiles = fs.readdirSync(cyclePath)
      .filter((f) => f.endsWith('.md'))
      .sort();

    const docTypeMap = {
      '00-input': 'input',
      '01-validacao-marca': 'brand_validation',
      '02-plano-execucao': 'execution_plan',
      '03-briefing-estruturado': 'structured_briefing',
      '04-roteiro-aida-ux': 'script',
      '05-qa-relatorio': 'qa_report',
      '06-entrega-final': 'final_delivery',
      '07-cruzamento-personas': 'persona_crossover',
      '08-roteiros-personas-oficiais': 'persona_scripts',
    };

    let docCount = 0;
    for (const docFile of docFiles) {
      if (docFile === 'README.md' || docFile === 'preflight-operacao-principal.md') continue;

      const baseName = docFile.replace('.md', '');
      const docType = docTypeMap[baseName] || 'other';
      const docNumber = parseInt(baseName.split('-')[0], 10) || 99;

      const docContent = fs.readFileSync(path.join(cyclePath, docFile), 'utf8');

      await briefing.create('briefing_doc', {
        cycle_id: cycleId,
        doc_type: docType,
        doc_number: docNumber,
        title: baseName,
        content: docContent,
        status: 'approved',
        metadata_json: { source_file: `${dir}/${docFile}` },
      });
      docCount++;
    }

    console.log(`  Cycle ${cycleNumber} (${cycleDate}): ${docCount} docs`);
  }
}

async function main() {
  console.log(`AIOX Data Migration - ${IS_REMOTE ? 'REMOTE' : 'LOCAL'}`);
  console.log(`Target: ${DB_CONFIG.url}`);

  const health = await db.healthCheck();
  if (!health.ok) {
    console.error(`Database not reachable: ${health.error}`);
    process.exit(1);
  }
  console.log(`Database OK (${health.latency}ms)`);

  await migrateBrandRules();
  await migrateKnowledgeBase();
  await migrateWorkflows();
  await migrateBriefingCycles();

  console.log('\nMigration complete!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
