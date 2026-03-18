#!/usr/bin/env node

/**
 * Agent Panel Data Generator
 *
 * Generates comprehensive agent data for the Painel de Agentes.
 * Reads agent definitions, memory, activity, and status.
 *
 * Usage:
 *   node bin/agent-panel.js                    # Generate full agent panel data
 *   node bin/agent-panel.js --json             # Output as JSON only
 *   node bin/agent-panel.js --agent dev        # Show specific agent detail
 *   node bin/agent-panel.js --dashboard        # Export to health-dashboard public/data/
 *
 * @module bin/agent-panel
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, '.aiox-core', 'development', 'agents');
const SQUADS_DIR = path.join(ROOT, 'squads');
const REPORTS_DIR = path.join(ROOT, '.aiox', 'sentinel-reports');
const DASHBOARD_DATA_DIR = path.join(ROOT, '.aiox-core', 'scripts', 'diagnostics', 'health-dashboard', 'public', 'data');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    dashboard: args.includes('--dashboard'),
    agent: args.includes('--agent')
      ? args[args.indexOf('--agent') + 1]
      : null,
  };
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return '';
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * Parse agent YAML frontmatter from .md file.
 */
function parseAgentMeta(content) {
  const meta = {};

  // Extract agent name/title/icon/role from YAML block
  const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
  const idMatch = content.match(/^\s*id:\s*(.+)$/m);
  const titleMatch = content.match(/^\s*title:\s*(.+)$/m);
  const iconMatch = content.match(/^\s*icon:\s*(.+)$/m);
  const roleMatch = content.match(/^\s*role:\s*(.+)$/m);
  const whenToUseMatch = content.match(/^\s*whenToUse:\s*(.+)$/m);
  const archetypeMatch = content.match(/^\s*archetype:\s*(.+)$/m);

  if (nameMatch) meta.persona_name = nameMatch[1].trim();
  if (idMatch) meta.id = idMatch[1].trim();
  if (titleMatch) meta.title = titleMatch[1].trim();
  if (iconMatch) meta.icon = iconMatch[1].trim();
  if (roleMatch) meta.role = roleMatch[1].trim();
  if (whenToUseMatch) meta.when_to_use = whenToUseMatch[1].trim();
  if (archetypeMatch) meta.archetype = archetypeMatch[1].trim();

  // Extract commands
  const commands = [];
  const cmdRegex = /^\s*-\s+(\w[\w-]*):\s*(.+)$/gm;
  let match;
  while ((match = cmdRegex.exec(content)) !== null) {
    if (!['name', 'id', 'title', 'icon', 'type'].includes(match[1])) {
      commands.push({ name: match[1], description: match[2].replace(/['"`]/g, '').trim() });
    }
  }
  meta.commands = commands.slice(0, 30); // cap

  return meta;
}

/**
 * Find which squads an agent belongs to.
 */
function findAgentSquads(agentId) {
  const squads = [];
  try {
    const squadDirs = fs.readdirSync(SQUADS_DIR).filter(f => {
      return fileExists(path.join(SQUADS_DIR, f, 'squad.yaml'));
    });

    for (const dir of squadDirs) {
      const agentsDir = path.join(SQUADS_DIR, dir, 'agents');
      if (dirExists(agentsDir)) {
        const members = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
        const memberIds = members.map(m => m.replace('.md', ''));
        if (memberIds.includes(agentId)) {
          squads.push(dir);
        }
      }

      // Also check squad.yaml for agent references
      const yamlContent = readFile(path.join(SQUADS_DIR, dir, 'squad.yaml'));
      if (yamlContent.includes(agentId)) {
        if (!squads.includes(dir)) squads.push(dir);
      }
    }
  } catch { /* ignore */ }
  return squads;
}

/**
 * Get recent git activity for an agent.
 */
function getAgentActivity(agentId) {
  // Check commits mentioning this agent
  const commits = run(`git log --all --oneline --since="30 days ago" --grep="${agentId}" 2>/dev/null`);
  const commitList = commits ? commits.split('\n').filter(Boolean) : [];

  // Check last modification of agent file
  const agentFile = path.join(AGENTS_DIR, `${agentId}.md`);
  let lastModified = null;
  try {
    const stat = fs.statSync(agentFile);
    lastModified = stat.mtime.toISOString();
  } catch { /* ignore */ }

  // Check last modification of memory
  const memoryFile = path.join(AGENTS_DIR, agentId, 'MEMORY.md');
  let lastMemoryUpdate = null;
  try {
    const stat = fs.statSync(memoryFile);
    lastMemoryUpdate = stat.mtime.toISOString();
  } catch { /* ignore */ }

  return {
    recent_commits: commitList.slice(0, 10),
    commits_30d: commitList.length,
    last_file_modified: lastModified,
    last_memory_update: lastMemoryUpdate,
  };
}

/**
 * Read agent memory content.
 */
function getAgentMemory(agentId) {
  const memoryPath = path.join(AGENTS_DIR, agentId, 'MEMORY.md');
  if (!fileExists(memoryPath)) {
    return { exists: false, content: null, lines: 0, age_days: null };
  }

  const content = readFile(memoryPath);
  const lines = content.split('\n').length;
  let ageDays = null;
  try {
    const stat = fs.statSync(memoryPath);
    ageDays = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
  } catch { /* ignore */ }

  return {
    exists: true,
    content,
    lines,
    age_days: ageDays,
    path: memoryPath,
  };
}

/**
 * Get sentinel reports for autoavaliativo agent.
 */
function getSentinelReports(limit) {
  if (!dirExists(REPORTS_DIR)) return [];

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit || 5);

  return files.map(f => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
      return {
        file: f,
        date: content.date,
        timestamp: content.timestamp,
        summary: content.summary,
        alerts: content.sections?.alerts || [],
        pendencies: content.sections?.pendencies || [],
      };
    } catch {
      return { file: f, error: 'parse_failed' };
    }
  });
}

/**
 * Determine agent operational status.
 */
function determineStatus(agentId, memory, activity) {
  if (agentId === 'autoavaliativo') {
    // Sentinel has special status based on report recency
    const reports = getSentinelReports(1);
    if (reports.length > 0 && reports[0].timestamp) {
      const age = Date.now() - new Date(reports[0].timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) return 'active';
    }
  }

  if (!memory.exists) return 'no_memory';
  if (memory.age_days !== null && memory.age_days > 14) return 'idle';
  if (activity.commits_30d > 0) return 'active';
  if (memory.age_days !== null && memory.age_days > 7) return 'stale';
  return 'ready';
}

/**
 * Collect data for a single agent.
 */
function collectAgentData(agentId) {
  const agentFile = path.join(AGENTS_DIR, `${agentId}.md`);
  const content = readFile(agentFile);
  const meta = parseAgentMeta(content);
  const memory = getAgentMemory(agentId);
  const activity = getAgentActivity(agentId);
  const squads = findAgentSquads(agentId);
  const status = determineStatus(agentId, memory, activity);

  const agent = {
    id: agentId,
    tag: `@${agentId}`,
    persona_name: meta.persona_name || agentId,
    title: meta.title || meta.role || 'Agent',
    icon: meta.icon || '🤖',
    role: meta.role || 'Not defined',
    when_to_use: meta.when_to_use || '',
    archetype: meta.archetype || '',
    status,
    squads,
    has_squad: squads.length > 0,
    memory: {
      exists: memory.exists,
      lines: memory.lines,
      age_days: memory.age_days,
    },
    activity: {
      commits_30d: activity.commits_30d,
      last_file_modified: activity.last_file_modified,
      last_memory_update: activity.last_memory_update,
    },
    commands_count: meta.commands?.length || 0,
  };

  return agent;
}

/**
 * Collect detailed data for a specific agent (for detail page).
 */
function collectAgentDetail(agentId) {
  const agent = collectAgentData(agentId);
  const agentFile = path.join(AGENTS_DIR, `${agentId}.md`);
  const content = readFile(agentFile);
  const meta = parseAgentMeta(content);
  const memory = getAgentMemory(agentId);
  const activity = getAgentActivity(agentId);

  agent.commands = meta.commands || [];
  agent.memory_content = memory.content;
  agent.recent_commits = activity.recent_commits;

  // Special data for Sentinel
  if (agentId === 'autoavaliativo') {
    agent.sentinel = {
      reports: getSentinelReports(10),
    };
  }

  return agent;
}

/**
 * Collect all agents data.
 */
function collectAllAgents() {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'));

  const agents = agentFiles.map(f => collectAgentData(f.replace('.md', '')));

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.status === 'active').length,
    ready: agents.filter(a => a.status === 'ready').length,
    idle: agents.filter(a => a.status === 'idle').length,
    stale: agents.filter(a => a.status === 'stale').length,
    no_memory: agents.filter(a => a.status === 'no_memory').length,
    with_squad: agents.filter(a => a.has_squad).length,
    without_squad: agents.filter(a => !a.has_squad).length,
  };

  return {
    timestamp: new Date().toISOString(),
    agents,
    stats,
  };
}

/**
 * Print human-readable output.
 */
function printAgents(data) {
  const s = data.stats;

  console.log('');
  console.log('='.repeat(60));
  console.log('  AIOX Painel de Agentes');
  console.log(`  ${data.timestamp}`);
  console.log('='.repeat(60));
  console.log(`\n  Total: ${s.total} agentes | ${s.active} ativos | ${s.with_squad} em squads\n`);

  for (const a of data.agents) {
    const statusIcon = {
      active: '\u2705',
      ready: '\u{1F7E2}',
      idle: '\u{1F7E1}',
      stale: '\u{1F7E0}',
      no_memory: '\u274C',
    }[a.status] || '\u2753';

    const squadTag = a.has_squad ? ` [${a.squads.join(', ')}]` : '';
    console.log(`  ${statusIcon} ${a.icon} ${a.tag} — ${a.persona_name} (${a.title})`);
    console.log(`     Status: ${a.status} | Memory: ${a.memory.lines} lines | Commits 30d: ${a.activity.commits_30d}${squadTag}`);
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Print agent detail.
 */
function printAgentDetail(agent) {
  console.log('');
  console.log('='.repeat(60));
  console.log(`  ${agent.icon} ${agent.persona_name} (${agent.tag})`);
  console.log(`  ${agent.title}`);
  console.log('='.repeat(60));
  console.log(`\n  Role: ${agent.role}`);
  console.log(`  Status: ${agent.status}`);
  console.log(`  Squads: ${agent.squads.length > 0 ? agent.squads.join(', ') : 'nenhum'}`);
  console.log(`  When to use: ${agent.when_to_use || 'N/A'}`);

  console.log('\n  MEMORIA');
  if (agent.memory.exists) {
    console.log(`  ${agent.memory.lines} linhas | ${agent.memory.age_days}d atras`);
  } else {
    console.log('  Sem MEMORY.md');
  }

  console.log('\n  ATIVIDADE');
  console.log(`  Commits 30d: ${agent.activity.commits_30d}`);
  if (agent.recent_commits?.length > 0) {
    for (const c of agent.recent_commits.slice(0, 5)) {
      console.log(`    ${c}`);
    }
  }

  if (agent.commands?.length > 0) {
    console.log(`\n  COMANDOS (${agent.commands.length})`);
    for (const cmd of agent.commands.slice(0, 15)) {
      console.log(`    *${cmd.name} — ${cmd.description}`);
    }
  }

  if (agent.sentinel) {
    console.log('\n  SENTINEL REPORTS');
    for (const r of agent.sentinel.reports) {
      if (r.error) continue;
      const s = r.summary;
      console.log(`    ${r.date}: ${s?.alerts_high || 0}H ${s?.alerts_warning || 0}W | ${s?.pending_stories || 0} pendentes`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Export to dashboard.
 */
function exportToDashboard(data) {
  if (!dirExists(DASHBOARD_DATA_DIR)) {
    fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(DASHBOARD_DATA_DIR, 'agent-panel.json'),
    JSON.stringify(data, null, 2),
  );
  console.log(`  Dashboard data exported to ${path.relative(ROOT, DASHBOARD_DATA_DIR)}/agent-panel.json`);
}

function main() {
  const { json, dashboard, agent } = parseArgs();

  if (agent) {
    const detail = collectAgentDetail(agent);
    if (json || dashboard) {
      if (dashboard) {
        if (!dirExists(DASHBOARD_DATA_DIR)) {
          fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(
          path.join(DASHBOARD_DATA_DIR, `agent-detail-${agent}.json`),
          JSON.stringify(detail, null, 2),
        );
        console.log(`  Agent detail exported to agent-detail-${agent}.json`);
      }
      if (json) console.log(JSON.stringify(detail, null, 2));
    } else {
      printAgentDetail(detail);
    }
    return;
  }

  const data = collectAllAgents();

  if (dashboard) {
    exportToDashboard(data);
    // Also export individual agent details
    for (const a of data.agents) {
      const detail = collectAgentDetail(a.id);
      fs.writeFileSync(
        path.join(DASHBOARD_DATA_DIR, `agent-detail-${a.id}.json`),
        JSON.stringify(detail, null, 2),
      );
    }
    console.log(`  ${data.agents.length} agent details exported`);
    if (!json) printAgents(data);
    return;
  }

  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    printAgents(data);
  }
}

main();
