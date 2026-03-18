/**
 * AIOX Database Module - Entry Point
 *
 * Provides centralized database access for all AIOX agents and modules.
 * Wraps @supabase/supabase-js with schema-aware clients and agent role context.
 *
 * @module core/db
 * @version 1.0.0
 * @created 2026-03-13 (Database Phase 1-4)
 */

const { DatabaseClient } = require('./db-client');
const { SchemaClient } = require('./schema-client');

let _instance = null;

/**
 * Get or create the singleton DatabaseClient instance.
 * @returns {DatabaseClient}
 */
function getDbClient() {
  if (!_instance) {
    _instance = new DatabaseClient();
  }
  return _instance;
}

/**
 * Get a schema-specific client for an agent.
 * @param {string} schema - Schema name (agents, memory, briefing, personas, reports, workflow, system_logs)
 * @param {string} agentId - Agent identifier
 * @param {string} agentRole - Agent role (admin, core_agent, core_qa, core_devops, squad_uxgroup, squad_persona)
 * @returns {SchemaClient}
 */
function getSchemaClient(schema, agentId, agentRole) {
  const db = getDbClient();
  return db.schema(schema, agentId, agentRole);
}

module.exports = {
  DatabaseClient,
  SchemaClient,
  getDbClient,
  getSchemaClient,
};
