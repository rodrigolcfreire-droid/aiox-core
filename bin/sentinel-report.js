#!/usr/bin/env node

/**
 * Sentinel Report Generator
 *
 * Generates comprehensive system health reports for the AIOS Autoavaliativo agent.
 * Reports are saved to .aiox/sentinel-reports/ as JSON for historical tracking.
 *
 * Usage:
 *   node bin/sentinel-report.js                    # Generate full report
 *   node bin/sentinel-report.js --json             # Output as JSON only
 *   node bin/sentinel-report.js --history          # Show report history
 *   node bin/sentinel-report.js --history --last 5 # Show last 5 reports
 *   node bin/sentinel-report.js --section agents   # Show specific section
 *   node bin/sentinel-report.js --dashboard        # Export to health-dashboard public/data/
 *
 * @module bin/sentinel-report
 * @version 1.0.0
 * @story 2026-03-14-database-phase5-hardening
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, '.aiox', 'sentinel-reports');
const DASHBOARD_DATA_DIR = path.join(ROOT, '.aiox-core', 'scripts', 'diagnostics', 'health-dashboard', 'public', 'data');
const AGENTS_DIR = path.join(ROOT, '.aiox-core', 'development', 'agents');
const SQUADS_DIR = path.join(ROOT, 'squads');
const STORIES_DIR = path.join(ROOT, 'docs', 'stories');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const BIN_DIR = path.join(ROOT, 'bin');

/**
 * Parse CLI arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    history: args.includes('--history'),
    last: args.includes('--last')
      ? parseInt(args[args.indexOf('--last') + 1], 10) || 5
      : 10,
    section: args.includes('--section')
      ? args[args.indexOf('--section') + 1]
      : null,
    dashboard: args.includes('--dashboard'),
  };
}

/**
 * Run a shell command safely.
 */
function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return '';
  }
}

/**
 * List files matching a pattern in a directory.
 */
function listFiles(dir, ext) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(ext));
  } catch {
    return [];
  }
}

/**
 * Check if directory exists.
 */
function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Check if file exists.
 */
function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/**
 * Count lines in a file.
 */
function lineCount(p) {
  try { return fs.readFileSync(p, 'utf8').split('\n').length; } catch { return 0; }
}

/**
 * Section 1: Recent Activity Summary
 */
function collectActivity() {
  const commits24h = run('git log --since="24 hours ago" --oneline --all');
  const commitsWeek = run('git log --since="7 days ago" --oneline --all');
  const lastCommit = run('git log -1 --format="%h %s (%ar)"');
  const modifiedFiles = run('git status --short').split('\n').filter(Boolean);
  const staged = modifiedFiles.filter(l => l[0] !== ' ' && l[0] !== '?');
  const untracked = modifiedFiles.filter(l => l.startsWith('??'));
  const unstaged = modifiedFiles.filter(l => l[0] === ' ');

  // Detailed commit log for activity history
  const commitDetails = run('git log --since="24 hours ago" --all --format="%h|%s|%an|%ar"');
  const detailedCommits = commitDetails
    ? commitDetails.split('\n').filter(Boolean).map(line => {
      const [hash, message, author, when] = line.split('|');
      return { hash, message, author, when };
    })
    : [];

  // Categorize file changes
  const agentChanges = modifiedFiles.filter(l => l.includes('agents/'));
  const squadChanges = modifiedFiles.filter(l => l.includes('squads/'));
  const dbChanges = modifiedFiles.filter(l => l.includes('db') || l.includes('migration') || l.includes('supabase'));
  const scriptChanges = modifiedFiles.filter(l => l.includes('bin/') || l.includes('scripts/'));
  const storyChanges = modifiedFiles.filter(l => l.includes('stories/'));
  const configChanges = modifiedFiles.filter(l =>
    l.includes('.yaml') || l.includes('.json') || l.includes('config') || l.includes('.env'),
  );

  return {
    commits_24h: commits24h ? commits24h.split('\n') : [],
    commits_24h_detailed: detailedCommits,
    commits_7d: commitsWeek ? commitsWeek.split('\n').length : 0,
    last_commit: lastCommit,
    modified_count: modifiedFiles.length,
    staged_count: staged.length,
    unstaged_count: unstaged.length,
    untracked_count: untracked.length,
    modified_files: modifiedFiles.map(l => l.trim()),
    changes_by_area: {
      agents: agentChanges.length,
      squads: squadChanges.length,
      database: dbChanges.length,
      scripts: scriptChanges.length,
      stories: storyChanges.length,
      configs: configChanges.length,
    },
  };
}

/**
 * Section 2: System State
 */
function collectSystemState() {
  const agentFiles = listFiles(AGENTS_DIR, '.md');
  const squadDirs = listFiles(SQUADS_DIR, '').filter(f => {
    return fileExists(path.join(SQUADS_DIR, f, 'squad.yaml'));
  });
  const skillDirs = listFiles(SKILLS_DIR, '').filter(f => {
    return dirExists(path.join(SKILLS_DIR, f)) || f.endsWith('.md');
  });
  const storyFiles = listFiles(STORIES_DIR, '.md');
  const branch = run('git branch --show-current');

  return {
    agents_total: agentFiles.length,
    agents: agentFiles.map(f => f.replace('.md', '')),
    squads_total: squadDirs.length,
    squads: squadDirs,
    skills_total: skillDirs.length,
    skills: skillDirs,
    stories_total: storyFiles.length,
    stories: storyFiles,
    branch,
  };
}

/**
 * Section 3: Agent Health
 */
function collectAgentHealth() {
  const agentFiles = listFiles(AGENTS_DIR, '.md');
  const agents = [];

  for (const file of agentFiles) {
    const id = file.replace('.md', '');
    const memoryPath = path.join(AGENTS_DIR, id, 'MEMORY.md');
    const hasMemory = fileExists(memoryPath);
    const memoryLines = hasMemory ? lineCount(memoryPath) : 0;

    let memoryAge = null;
    if (hasMemory) {
      try {
        const stat = fs.statSync(memoryPath);
        memoryAge = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
      } catch { /* ignore */ }
    }

    agents.push({
      id,
      has_memory: hasMemory,
      memory_lines: memoryLines,
      memory_age_days: memoryAge,
      status: hasMemory ? 'active' : 'no_memory',
    });
  }

  const withMemory = agents.filter(a => a.has_memory).length;
  const withoutMemory = agents.filter(a => !a.has_memory).length;
  const staleMemory = agents.filter(a => a.memory_age_days !== null && a.memory_age_days > 7).length;

  return {
    agents,
    with_memory: withMemory,
    without_memory: withoutMemory,
    stale_memory: staleMemory,
    total: agents.length,
  };
}

/**
 * Section 4: Squad Performance
 */
function collectSquadPerformance() {
  const squads = [];

  try {
    const squadDirs = fs.readdirSync(SQUADS_DIR).filter(f => {
      return fileExists(path.join(SQUADS_DIR, f, 'squad.yaml'));
    });

    for (const dir of squadDirs) {
      const agentsDir = path.join(SQUADS_DIR, dir, 'agents');
      const members = dirExists(agentsDir) ? listFiles(agentsDir, '.md') : [];
      const configPath = path.join(SQUADS_DIR, dir, 'squad.yaml');

      let lastActivity = null;
      try {
        const stat = fs.statSync(configPath);
        lastActivity = stat.mtime.toISOString().split('T')[0];
      } catch { /* ignore */ }

      squads.push({
        id: dir,
        members_count: members.length,
        members: members.map(m => m.replace('.md', '')),
        last_activity: lastActivity,
        status: 'active',
      });
    }
  } catch { /* ignore */ }

  return { squads, total: squads.length };
}

/**
 * Section 5: Database Monitoring
 */
function collectDatabaseStatus() {
  const envPath = path.join(ROOT, '.env');
  const envContent = fileExists(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const credentials = {
    SUPABASE_URL: envContent.includes('SUPABASE_URL='),
    SUPABASE_ANON_KEY: envContent.includes('SUPABASE_ANON_KEY='),
    SUPABASE_SERVICE_KEY: envContent.includes('SUPABASE_SERVICE_KEY='),
    SUPABASE_DB_URL: envContent.includes('SUPABASE_DB_URL='),
  };

  const dbScripts = listFiles(BIN_DIR, '.js').filter(f => f.startsWith('db-'));
  const expectedScripts = [
    'db-audit-security.js',
    'db-check-consistency.js',
    'db-benchmark.js',
    'db-backup.js',
    'db-restore.js',
    'db-weekly-report.js',
  ];
  const missingScripts = expectedScripts.filter(s => !dbScripts.includes(s));

  const migrationDir = path.join(ROOT, 'supabase', 'migrations');
  const migrations = dirExists(migrationDir) ? listFiles(migrationDir, '.sql') : [];

  return {
    phases: { '1-4': 'DONE', '5': 'IN_PROGRESS' },
    schemas: 7,
    tables: 30,
    rls_policies: '~80',
    credentials,
    db_scripts: dbScripts,
    missing_scripts: missingScripts,
    migrations_count: migrations.length,
  };
}

/**
 * Section 6: Memory Verification
 */
function collectMemoryStatus() {
  const projectMemoryDir = path.join(ROOT, '..', '..', '.claude', 'projects', '-Users-rodrigo-Documents-AIOS', 'memory');
  let projectMemories = [];
  try {
    projectMemories = listFiles(projectMemoryDir, '.md');
  } catch { /* ignore */ }

  const agentHealth = collectAgentHealth();
  const totalLines = agentHealth.agents.reduce((sum, a) => sum + a.memory_lines, 0);

  return {
    agent_memories: agentHealth.with_memory,
    agents_without_memory: agentHealth.without_memory,
    stale_memories: agentHealth.stale_memory,
    total_memory_lines: totalLines,
    project_memories: projectMemories.length,
    project_memory_files: projectMemories,
  };
}

/**
 * Section 7: System Alerts
 */
function collectAlerts(activity, systemState, agentHealth, dbStatus) {
  const alerts = [];

  // Credential alerts
  if (!dbStatus.credentials.SUPABASE_SERVICE_KEY) {
    alerts.push({ severity: 'HIGH', message: 'SUPABASE_SERVICE_KEY nao configurada' });
  }

  // Agent alerts
  const noMemory = agentHealth.agents.filter(a => !a.has_memory);
  if (noMemory.length > 0) {
    alerts.push({
      severity: 'WARNING',
      message: `${noMemory.length} agentes sem MEMORY.md: ${noMemory.map(a => a.id).join(', ')}`,
    });
  }

  const stale = agentHealth.agents.filter(a => a.memory_age_days > 7);
  if (stale.length > 0) {
    alerts.push({
      severity: 'INFO',
      message: `${stale.length} agentes com memoria > 7 dias: ${stale.map(a => a.id).join(', ')}`,
    });
  }

  // Untracked files
  if (activity.untracked_count > 5) {
    alerts.push({
      severity: 'WARNING',
      message: `${activity.untracked_count} arquivos untracked`,
    });
  }

  // Missing scripts
  if (dbStatus.missing_scripts.length > 0) {
    alerts.push({
      severity: 'WARNING',
      message: `${dbStatus.missing_scripts.length} scripts de hardening pendentes: ${dbStatus.missing_scripts.join(', ')}`,
    });
  }

  // Uncommitted changes
  if (activity.modified_count > 10) {
    alerts.push({
      severity: 'WARNING',
      message: `${activity.modified_count} arquivos modificados sem commit`,
    });
  }

  return alerts;
}

/**
 * Section 8: Pending Operations
 */
function collectPendencies(dbStatus) {
  const pendencies = [];

  // Check stories status
  const storyFiles = listFiles(STORIES_DIR, '.md');
  for (const file of storyFiles) {
    const content = fs.readFileSync(path.join(STORIES_DIR, file), 'utf8');
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
    const status = statusMatch ? statusMatch[1] : 'unknown';

    if (status !== 'Done') {
      const unchecked = (content.match(/- \[ \]/g) || []).length;
      const checked = (content.match(/- \[x\]/g) || []).length;
      pendencies.push({
        story: file,
        status,
        progress: `${checked}/${checked + unchecked}`,
        unchecked,
      });
    }
  }

  // Missing scripts
  if (dbStatus.missing_scripts.length > 0) {
    pendencies.push({
      type: 'missing_scripts',
      items: dbStatus.missing_scripts,
    });
  }

  // Missing credentials
  if (!dbStatus.credentials.SUPABASE_SERVICE_KEY) {
    pendencies.push({ type: 'missing_credential', item: 'SUPABASE_SERVICE_KEY' });
  }

  return pendencies;
}

/**
 * Generate full report.
 */
function generateReport() {
  const activity = collectActivity();
  const systemState = collectSystemState();
  const agentHealth = collectAgentHealth();
  const squadPerf = collectSquadPerformance();
  const dbStatus = collectDatabaseStatus();
  const memoryStatus = collectMemoryStatus();
  const alerts = collectAlerts(activity, systemState, agentHealth, dbStatus);
  const pendencies = collectPendencies(dbStatus);

  return {
    id: `sentinel-${Date.now()}`,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    sections: {
      activity,
      system_state: systemState,
      agent_health: agentHealth,
      squad_performance: squadPerf,
      database: dbStatus,
      memory: memoryStatus,
      alerts,
      pendencies,
    },
    summary: {
      agents: systemState.agents_total,
      squads: systemState.squads_total,
      skills: systemState.skills_total,
      stories: systemState.stories_total,
      alerts_high: alerts.filter(a => a.severity === 'HIGH').length,
      alerts_warning: alerts.filter(a => a.severity === 'WARNING').length,
      alerts_info: alerts.filter(a => a.severity === 'INFO').length,
      pending_stories: pendencies.filter(p => p.story).length,
      uncommitted_files: activity.modified_count,
    },
  };
}

/**
 * Save report to history.
 */
function saveReport(report) {
  if (!dirExists(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const filename = `${report.date}-${report.id}.json`;
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  return filepath;
}

/**
 * Load report history.
 */
function loadHistory(limit) {
  if (!dirExists(REPORTS_DIR)) return [];

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map(f => {
    const content = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
    return {
      file: f,
      date: content.date,
      timestamp: content.timestamp,
      summary: content.summary,
    };
  });
}

/**
 * Print human-readable report.
 */
function printReport(report) {
  const r = report.sections;
  const s = report.summary;

  console.log('');
  console.log('='.repeat(60));
  console.log('  AIOX Sentinel Report');
  console.log(`  Date: ${report.date} | ${report.timestamp}`);
  console.log('='.repeat(60));

  // 1. Activity
  console.log('\n  1. RESUMO OPERACIONAL');
  console.log(`     Commits 24h: ${r.activity.commits_24h.length}`);
  console.log(`     Commits 7d: ${r.activity.commits_7d}`);
  console.log(`     Ultimo commit: ${r.activity.last_commit}`);
  console.log(`     Arquivos modificados: ${r.activity.modified_count} (${r.activity.staged_count} staged, ${r.activity.untracked_count} untracked)`);

  // 2. System State
  console.log('\n  2. ESTADO DO SISTEMA');
  console.log(`     Agentes: ${s.agents} | Squads: ${s.squads} | Skills: ${s.skills}`);
  console.log(`     Stories: ${s.stories} | Branch: ${r.system_state.branch}`);

  // 3. Agent Health
  console.log('\n  3. SAUDE DOS AGENTES');
  for (const a of r.agent_health.agents) {
    const icon = a.has_memory ? '\u2713' : '\u2717';
    const age = a.memory_age_days !== null ? ` (${a.memory_age_days}d)` : '';
    console.log(`     ${icon} ${a.id}: ${a.memory_lines} lines${age}`);
  }

  // 4. Squad Performance
  console.log('\n  4. PERFORMANCE DOS SQUADS');
  for (const sq of r.squad_performance.squads) {
    console.log(`     ${sq.id}: ${sq.members_count} membros, ultima atividade: ${sq.last_activity}`);
  }

  // 5. Database
  console.log('\n  5. BANCO DE DADOS');
  console.log(`     Fases 1-4: ${r.database.phases['1-4']} | Fase 5: ${r.database.phases['5']}`);
  console.log(`     Schemas: ${r.database.schemas} | Tabelas: ${r.database.tables} | RLS: ${r.database.rls_policies}`);
  console.log(`     Migrations: ${r.database.migrations_count}`);
  console.log(`     Scripts prontos: ${r.database.db_scripts.length}/6`);
  if (r.database.missing_scripts.length > 0) {
    console.log(`     Faltam: ${r.database.missing_scripts.join(', ')}`);
  }

  // 6. Memory
  console.log('\n  6. MEMORIAS');
  console.log(`     Agentes com memoria: ${r.memory.agent_memories}/${r.memory.agent_memories + r.memory.agents_without_memory}`);
  console.log(`     Total linhas: ${r.memory.total_memory_lines}`);
  console.log(`     Memorias projeto: ${r.memory.project_memories}`);

  // 7. Alerts
  console.log('\n  7. ALERTAS');
  if (r.alerts.length === 0) {
    console.log('     Nenhum alerta.');
  } else {
    for (const a of r.alerts) {
      const icon = a.severity === 'HIGH' ? '\u274C' : a.severity === 'WARNING' ? '\u26A0\uFE0F' : '\u2139\uFE0F';
      console.log(`     ${icon} ${a.severity}: ${a.message}`);
    }
  }

  // 8. Pendencies
  console.log('\n  8. PENDENCIAS');
  const storyPendencies = r.pendencies.filter(p => p.story);
  if (storyPendencies.length > 0) {
    for (const p of storyPendencies) {
      console.log(`     ${p.story}: ${p.status} (${p.progress}, ${p.unchecked} pendentes)`);
    }
  }
  const missingScripts = r.pendencies.find(p => p.type === 'missing_scripts');
  if (missingScripts) {
    console.log(`     Scripts faltando: ${missingScripts.items.join(', ')}`);
  }
  const missingCred = r.pendencies.find(p => p.type === 'missing_credential');
  if (missingCred) {
    console.log(`     Credencial faltando: ${missingCred.item}`);
  }

  // Summary
  console.log('\n' + '-'.repeat(60));
  console.log(`  Alertas: ${s.alerts_high} HIGH, ${s.alerts_warning} WARNING, ${s.alerts_info} INFO`);
  console.log(`  Stories pendentes: ${s.pending_stories} | Arquivos sem commit: ${s.uncommitted_files}`);
  console.log('='.repeat(60));
  console.log('');
}

/**
 * Print report history.
 */
function printHistory(history) {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Sentinel Report History');
  console.log('='.repeat(60));

  if (history.length === 0) {
    console.log('  Nenhum relatorio salvo ainda.');
  } else {
    for (const h of history) {
      const s = h.summary;
      console.log(`\n  ${h.date} ${h.timestamp.split('T')[1].split('.')[0]}`);
      console.log(`    Agents: ${s.agents} | Squads: ${s.squads} | Alerts: ${s.alerts_high}H ${s.alerts_warning}W`);
      console.log(`    Pending: ${s.pending_stories} stories, ${s.uncommitted_files} files`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('');
}

/**
 * Export report + history to dashboard public/data/.
 */
function exportToDashboard(report, historyData) {
  if (!dirExists(DASHBOARD_DATA_DIR)) {
    fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(DASHBOARD_DATA_DIR, 'sentinel-report.json'),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(DASHBOARD_DATA_DIR, 'sentinel-history.json'),
    JSON.stringify(historyData, null, 2),
  );

  console.log(`  Dashboard data exported to ${path.relative(ROOT, DASHBOARD_DATA_DIR)}/`);
}

/**
 * Main entry point.
 */
function main() {
  const { json, history, last, section, dashboard } = parseArgs();

  if (history) {
    const hist = loadHistory(last);
    if (json) {
      console.log(JSON.stringify(hist, null, 2));
    } else {
      printHistory(hist);
    }
    return;
  }

  const report = generateReport();
  const savedPath = saveReport(report);

  if (dashboard) {
    const hist = loadHistory(last);
    exportToDashboard(report, hist);
    if (!json) printReport(report);
    console.log(`  Report saved: ${path.relative(ROOT, savedPath)}`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (section) {
    const sectionData = report.sections[section];
    if (sectionData) {
      console.log(JSON.stringify(sectionData, null, 2));
    } else {
      console.error(`Section '${section}' not found. Available: ${Object.keys(report.sections).join(', ')}`);
      process.exit(1);
    }
  } else {
    printReport(report);
    console.log(`  Report saved: ${path.relative(ROOT, savedPath)}`);
  }
}

main();
