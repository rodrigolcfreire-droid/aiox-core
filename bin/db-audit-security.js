#!/usr/bin/env node

/**
 * AIOX Database Security Audit
 *
 * Validates RLS policies, permissions, and security configuration
 * across all 7 AIOX database schemas using direct PostgreSQL connection.
 *
 * Usage:
 *   node bin/db-audit-security.js [--target local|cloud] [--json] [--verbose]
 *
 * Environment:
 *   SUPABASE_DB_URL      - Direct PostgreSQL connection string
 *   SUPABASE_URL         - Supabase API URL (for audit trail logging)
 *   SUPABASE_SERVICE_KEY - Service role key (for audit trail logging)
 *
 * @module bin/db-audit-security
 * @version 1.0.0
 * @story 2026-03-14-database-phase5-hardening (WS1)
 */

'use strict';

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const SCHEMAS = ['agents', 'memory', 'briefing', 'personas', 'reports', 'workflow', 'system_logs'];
const REQUIRED_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE'];
const DEFAULT_LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Load .env file if present.
 */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Parse CLI arguments.
 * @returns {{ target: string, json: boolean, verbose: boolean }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const target = args.includes('--target')
    ? args[args.indexOf('--target') + 1] || 'local'
    : 'local';
  const json = args.includes('--json');
  const verbose = args.includes('--verbose');
  return { target, json, verbose };
}

/**
 * Create PostgreSQL client.
 * @param {string} target - 'local' or 'cloud'
 * @returns {Client}
 */
function createPgClient(target) {
  const connectionString = target === 'local'
    ? (process.env.SUPABASE_LOCAL_DB_URL || DEFAULT_LOCAL_DB_URL)
    : process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    throw new Error(
      `Database connection not configured for target '${target}'. ` +
      `Set ${target === 'local' ? 'SUPABASE_LOCAL_DB_URL' : 'SUPABASE_DB_URL'} in .env`,
    );
  }

  return new Client({
    connectionString,
    ssl: target === 'cloud' ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Query all tables with RLS status across AIOX schemas.
 * @param {Client} client
 * @returns {Promise<Array<{ schema: string, table: string, rls_enabled: boolean }>>}
 */
async function getTablesWithRlsStatus(client) {
  const result = await client.query(`
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1)
      AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname;
  `, [SCHEMAS]);

  return result.rows;
}

/**
 * Query all RLS policies across AIOX schemas.
 * @param {Client} client
 * @returns {Promise<Array<{ schema: string, table: string, policyname: string, cmd: string }>>}
 */
async function getRlsPolicies(client) {
  const result = await client.query(`
    SELECT
      schemaname AS schema,
      tablename AS table,
      policyname,
      cmd
    FROM pg_policies
    WHERE schemaname = ANY($1)
    ORDER BY schemaname, tablename, cmd;
  `, [SCHEMAS]);

  return result.rows;
}

/**
 * Query agent_schema_access to verify role permissions.
 * @param {Client} client
 * @returns {Promise<Array<{ agent_role: string, schema_name: string, can_read: boolean, can_write: boolean }>>}
 */
async function getAccessControl(client) {
  const result = await client.query(`
    SELECT agent_role, schema_name, can_read, can_write
    FROM public.agent_schema_access
    ORDER BY agent_role, schema_name;
  `);

  return result.rows;
}

/**
 * Check schema USAGE grants for anon and authenticated roles.
 * @param {Client} client
 * @returns {Promise<Array<{ schema: string, grantee: string, privilege: string }>>}
 */
async function getSchemaGrants(client) {
  const result = await client.query(`
    SELECT
      n.nspname AS schema,
      r.rolname AS grantee,
      p.privilege_type AS privilege
    FROM pg_namespace n
    JOIN lateral (
      SELECT * FROM aclexplode(n.nspacl)
    ) p ON true
    JOIN pg_roles r ON r.oid = p.grantee
    WHERE n.nspname = ANY($1)
      AND r.rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY n.nspname, r.rolname;
  `, [SCHEMAS]);

  return result.rows;
}

/**
 * Run the full security audit.
 * @param {Client} client
 * @returns {Promise<object>}
 */
async function runAudit(client) {
  const report = {
    timestamp: new Date().toISOString(),
    target: null,
    summary: {
      total_tables: 0,
      rls_enabled: 0,
      rls_disabled: 0,
      policies_total: 0,
      issues: [],
    },
    schemas: {},
    access_control: [],
    schema_grants: [],
    verdict: 'PASS',
  };

  // 1. Get tables with RLS status
  const tables = await getTablesWithRlsStatus(client);
  report.summary.total_tables = tables.length;

  // 2. Get policies
  const policies = await getRlsPolicies(client);
  report.summary.policies_total = policies.length;

  // 3. Get access control
  try {
    report.access_control = await getAccessControl(client);
  } catch (err) {
    report.summary.issues.push({
      severity: 'HIGH',
      message: `Cannot query access control: ${err.message}`,
    });
  }

  // 4. Get schema grants
  try {
    report.schema_grants = await getSchemaGrants(client);
  } catch (err) {
    report.summary.issues.push({
      severity: 'WARNING',
      message: `Cannot query schema grants: ${err.message}`,
    });
  }

  // 5. Analyze per schema
  for (const schema of SCHEMAS) {
    const schemaTables = tables.filter(t => t.schema === schema);
    const schemaPolicies = policies.filter(p => p.schema === schema);

    const schemaReport = {
      tables: [],
      issues: [],
      stats: { total: schemaTables.length, rls_ok: 0, rls_missing: 0, policy_gaps: 0 },
    };

    for (const table of schemaTables) {
      const tablePolicies = schemaPolicies.filter(p => p.table === table.table);
      const policyCmds = tablePolicies.map(p => p.cmd.toUpperCase());

      const tableReport = {
        name: table.table,
        rls_enabled: table.rls_enabled,
        policies: tablePolicies.map(p => ({ name: p.policyname, operation: p.cmd })),
        missing_operations: [],
      };

      // Check RLS enabled
      if (!table.rls_enabled) {
        schemaReport.issues.push({
          severity: 'CRITICAL',
          table: table.table,
          message: `RLS is DISABLED on ${schema}.${table.table}`,
        });
        schemaReport.stats.rls_missing++;
        report.summary.rls_disabled++;
      } else {
        schemaReport.stats.rls_ok++;
        report.summary.rls_enabled++;
      }

      // Check required operations have policies
      for (const op of REQUIRED_OPERATIONS) {
        if (!policyCmds.includes(op)) {
          tableReport.missing_operations.push(op);
          schemaReport.issues.push({
            severity: 'HIGH',
            table: table.table,
            message: `Missing ${op} policy on ${schema}.${table.table}`,
          });
          schemaReport.stats.policy_gaps++;
        }
      }

      schemaReport.tables.push(tableReport);
    }

    // Check if schema has no tables
    if (schemaTables.length === 0) {
      schemaReport.issues.push({
        severity: 'WARNING',
        message: `Schema '${schema}' has no tables`,
      });
    }

    report.schemas[schema] = schemaReport;
    report.summary.issues.push(...schemaReport.issues);
  }

  // 6. Check access control coverage
  const schemasWithAccess = new Set(report.access_control.map(a => a.schema_name));
  for (const schema of SCHEMAS) {
    if (!schemasWithAccess.has(schema)) {
      report.summary.issues.push({
        severity: 'HIGH',
        message: `No access control entries for schema '${schema}'`,
      });
    }
  }

  // 7. Determine verdict
  const criticalCount = report.summary.issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = report.summary.issues.filter(i => i.severity === 'HIGH').length;

  if (criticalCount > 0) {
    report.verdict = 'FAIL';
  } else if (highCount > 0) {
    report.verdict = 'CONCERNS';
  } else {
    report.verdict = 'PASS';
  }

  return report;
}

/**
 * Log result to system_logs.audit_trail via Supabase API.
 * @param {object} report
 */
async function logToAuditTrail(report) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const { createClient } = require('@supabase/supabase-js');
    const logClient = createClient(url, key, { db: { schema: 'system_logs' } });

    const { error } = await logClient
      .from('audit_trail')
      .insert({
        event_type: 'security_audit',
        event_source: 'db-audit-security',
        event_data: report,
        severity: report.verdict === 'PASS' ? 'info' : report.verdict === 'FAIL' ? 'critical' : 'warning',
      });

    if (error) {
      console.error('  Warning: Could not log to audit_trail:', error.message);
    }
  } catch (err) {
    console.error('  Warning: Could not log to audit_trail:', err.message);
  }
}

/**
 * Print human-readable report.
 * @param {object} report
 * @param {boolean} verbose
 */
function printReport(report, verbose) {
  const verdictIcon = report.verdict === 'PASS' ? '\u2705' : report.verdict === 'FAIL' ? '\u274C' : '\u26A0\uFE0F';

  console.log('');
  console.log('='.repeat(60));
  console.log('  AIOX Database Security Audit');
  console.log(`  Target: ${report.target} | ${report.timestamp}`);
  console.log('='.repeat(60));
  console.log('');

  // Summary
  console.log(`  Tables: ${report.summary.total_tables}`);
  console.log(`  RLS Enabled: ${report.summary.rls_enabled}`);
  console.log(`  RLS Disabled: ${report.summary.rls_disabled}`);
  console.log(`  Total Policies: ${report.summary.policies_total}`);
  console.log('');

  // Per schema
  for (const schema of SCHEMAS) {
    const s = report.schemas[schema];
    if (!s) continue;
    const schemaIcon = s.issues.length === 0 ? '\u2705' : '\u26A0\uFE0F';
    console.log(`  ${schemaIcon} ${schema}: ${s.stats.total} tables, ${s.stats.rls_ok} RLS OK, ${s.stats.policy_gaps} policy gaps`);

    if (verbose && s.tables.length > 0) {
      for (const t of s.tables) {
        const tIcon = t.rls_enabled && t.missing_operations.length === 0 ? '\u2713' : '\u2717';
        const missing = t.missing_operations.length > 0 ? ` (missing: ${t.missing_operations.join(', ')})` : '';
        console.log(`    ${tIcon} ${t.name} \u2014 RLS: ${t.rls_enabled ? 'ON' : 'OFF'}, ${t.policies.length} policies${missing}`);
      }
    }
  }

  // Issues
  const criticals = report.summary.issues.filter(i => i.severity === 'CRITICAL');
  const highs = report.summary.issues.filter(i => i.severity === 'HIGH');
  const warnings = report.summary.issues.filter(i => i.severity === 'WARNING');

  if (criticals.length > 0 || highs.length > 0) {
    console.log('');
    console.log('  Issues:');
    for (const issue of criticals) {
      console.log(`    \u274C CRITICAL: ${issue.message}`);
    }
    for (const issue of highs) {
      console.log(`    \u26A0\uFE0F  HIGH: ${issue.message}`);
    }
  }

  if (verbose && warnings.length > 0) {
    for (const issue of warnings) {
      console.log(`    \u2139\uFE0F  WARNING: ${issue.message}`);
    }
  }

  // Access control summary
  if (verbose && report.access_control.length > 0) {
    console.log('');
    console.log('  Access Control Roles:');
    const roles = [...new Set(report.access_control.map(a => a.agent_role))];
    for (const role of roles) {
      const accesses = report.access_control.filter(a => a.agent_role === role);
      const readSchemas = accesses.filter(a => a.can_read).map(a => a.schema_name);
      const writeSchemas = accesses.filter(a => a.can_write).map(a => a.schema_name);
      console.log(`    ${role}: read=[${readSchemas.join(',')}] write=[${writeSchemas.join(',')}]`);
    }
  }

  console.log('');
  console.log(`  ${verdictIcon} Verdict: ${report.verdict}`);
  console.log('='.repeat(60));
  console.log('');
}

/**
 * Main entry point.
 */
async function main() {
  loadEnv();
  const { target, json, verbose } = parseArgs();

  const pgClient = createPgClient(target);

  try {
    await pgClient.connect();

    const report = await runAudit(pgClient);
    report.target = target;

    // Log to audit trail (non-blocking)
    await logToAuditTrail(report);

    // Output
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report, verbose);
    }

    // Exit code: 0 = PASS, 1 = FAIL/ERROR, 2 = CONCERNS
    if (report.verdict === 'FAIL' || report.verdict === 'ERROR') {
      process.exit(1);
    } else if (report.verdict === 'CONCERNS') {
      process.exit(2);
    }
  } catch (err) {
    console.error(`\u274C Security audit failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main();
