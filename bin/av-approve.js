#!/usr/bin/env node
'use strict';

/**
 * av-approve.js — CLI para aprovacao de cortes
 *
 * Comandos:
 *   node bin/av-approve.js <project-id>                       Listar cortes pendentes
 *   node bin/av-approve.js <project-id> approve <cut-id>      Aprovar corte
 *   node bin/av-approve.js <project-id> reject <cut-id>       Rejeitar corte
 *   node bin/av-approve.js <project-id> approve-all           Aprovar todos
 *   node bin/av-approve.js <project-id> learn                 Aprender com decisoes
 *   node bin/av-approve.js <project-id> playbook              Gerar playbook
 *
 * CLI First: Este script e a fonte da verdade para aprovacao audiovisual.
 */

const path = require('path');
const { approveCut, rejectCut, approveAll, getApprovalSummary } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'approval'));
const { learnFromProject, getLearningInsights } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'learning'));
const { generatePlaybook } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'playbook'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Approval Workflow');
    console.log('');
    console.log('  Usage:');
    console.log('    node bin/av-approve.js <project-id>');
    console.log('    node bin/av-approve.js <project-id> approve <cut-id> [feedback]');
    console.log('    node bin/av-approve.js <project-id> reject <cut-id> [feedback]');
    console.log('    node bin/av-approve.js <project-id> approve-all');
    console.log('    node bin/av-approve.js <project-id> learn');
    console.log('    node bin/av-approve.js <project-id> playbook');
    console.log('');
    process.exit(0);
  }

  const projectId = args[0];
  const command = args[1] || 'status';

  console.log('');
  console.log('  ================================================================');
  console.log('  CENTRAL AUDIOVISUAL — Approval Workflow');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  try {
    if (command === 'approve') {
      const cutId = args[2];
      const feedback = args.slice(3).join(' ');
      if (!cutId) { console.error('  Cut ID required'); process.exit(1); }
      approveCut(projectId, cutId, feedback);
      console.log(`  APPROVED: ${cutId}`);
    } else if (command === 'reject') {
      const cutId = args[2];
      const feedback = args.slice(3).join(' ');
      if (!cutId) { console.error('  Cut ID required'); process.exit(1); }
      rejectCut(projectId, cutId, feedback);
      console.log(`  REJECTED: ${cutId}`);
    } else if (command === 'approve-all') {
      const results = approveAll(projectId);
      console.log(`  Approved ${results.length} cuts`);
    } else if (command === 'learn') {
      const learnings = learnFromProject(projectId);
      console.log(`  Learned ${learnings.patterns.length} patterns`);
      const insights = getLearningInsights(projectId);
      for (const insight of insights.insights) {
        console.log(`  - ${insight}`);
      }
    } else if (command === 'playbook') {
      const pb = generatePlaybook(projectId);
      console.log(`  Playbook: ${pb.title}`);
      console.log(`  Recommendations: ${pb.recommendations.length}`);
      console.log(`  Templates: ${pb.templates.length}`);
      for (const r of pb.recommendations) {
        console.log(`  - [${r.area}] ${r.action}`);
      }
    } else {
      const summary = getApprovalSummary(projectId);
      console.log('  ── Approval Status ──────────────────────────────');
      console.log(`  Total:    ${summary.total}`);
      console.log(`  Approved: ${summary.approved}`);
      console.log(`  Rejected: ${summary.rejected}`);
      console.log(`  Pending:  ${summary.pending}`);
      console.log('');
      for (const c of summary.cuts) {
        const icon = c.status === 'approved' ? '+' : c.status === 'rejected' ? 'x' : '?';
        console.log(`  [${icon}] ${c.id}  ${c.status.padEnd(10)}  ${c.category}  score:${c.engagementScore}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
