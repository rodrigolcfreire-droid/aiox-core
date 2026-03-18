/**
 * AIOX Database Client
 *
 * Manages Supabase connection and provides schema-aware clients.
 * Supports both local (development) and remote (production) connections.
 *
 * Configuration via environment variables:
 *   SUPABASE_URL       - Project URL (default: http://127.0.0.1:54321)
 *   SUPABASE_ANON_KEY  - Public/anon key
 *   SUPABASE_SERVICE_KEY - Service role key (bypasses RLS)
 *   AIOX_DB_MODE       - 'file' | 'dual' | 'database' (default: file)
 *
 * @module core/db/db-client
 * @version 1.0.0
 */

const { createClient } = require('@supabase/supabase-js');
const { SchemaClient } = require('./schema-client');

const VALID_SCHEMAS = [
  'agents',
  'memory',
  'briefing',
  'personas',
  'reports',
  'workflow',
  'system_logs',
  'telegram',
  'whatsapp',
];

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321';

class DatabaseClient {
  constructor(options = {}) {
    this._url = options.url || process.env.SUPABASE_URL || DEFAULT_LOCAL_URL;
    this._anonKey = options.anonKey || process.env.SUPABASE_ANON_KEY || '';
    this._serviceKey = options.serviceKey || process.env.SUPABASE_SERVICE_KEY || '';
    this._mode = options.mode || process.env.AIOX_DB_MODE || 'file';
    this._clients = new Map();
    this._serviceClients = new Map();
  }

  /**
   * Check if database mode is active (not file-only).
   * @returns {boolean}
   */
  isActive() {
    return this._mode !== 'file' && (this._anonKey || this._serviceKey);
  }

  /**
   * Get current database mode.
   * @returns {string} 'file' | 'dual' | 'database'
   */
  getMode() {
    return this._mode;
  }

  /**
   * Get a schema-specific client for an agent.
   * @param {string} schemaName - One of the 7 AIOX schemas
   * @param {string} agentId - Agent identifier (e.g. 'dev', 'architect')
   * @param {string} agentRole - Agent role (e.g. 'core_agent', 'admin')
   * @returns {SchemaClient}
   */
  schema(schemaName, agentId, agentRole) {
    if (!VALID_SCHEMAS.includes(schemaName)) {
      throw new Error(`Invalid schema: ${schemaName}. Valid schemas: ${VALID_SCHEMAS.join(', ')}`);
    }

    const key = `${schemaName}:${agentId}:${agentRole}`;
    if (!this._clients.has(key)) {
      const client = this._createClient(schemaName, agentId, agentRole);
      this._clients.set(key, new SchemaClient(client, schemaName, agentId, agentRole));
    }
    return this._clients.get(key);
  }

  /**
   * Get a service-role client for a schema (bypasses RLS).
   * Use only for admin operations and data migration.
   * @param {string} schemaName - One of the 7 AIOX schemas
   * @returns {SchemaClient}
   */
  serviceSchema(schemaName) {
    if (!VALID_SCHEMAS.includes(schemaName)) {
      throw new Error(`Invalid schema: ${schemaName}. Valid schemas: ${VALID_SCHEMAS.join(', ')}`);
    }

    if (!this._serviceKey) {
      throw new Error('SUPABASE_SERVICE_KEY not configured. Cannot create service client.');
    }

    if (!this._serviceClients.has(schemaName)) {
      const client = createClient(this._url, this._serviceKey, {
        db: { schema: schemaName },
      });
      this._serviceClients.set(
        schemaName,
        new SchemaClient(client, schemaName, 'system', 'admin')
      );
    }
    return this._serviceClients.get(schemaName);
  }

  /**
   * Health check — verify connection to database.
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck() {
    const start = Date.now();
    try {
      const client = createClient(this._url, this._serviceKey || this._anonKey, {
        db: { schema: 'public' },
      });
      const { error } = await client
        .from('agent_schema_access')
        .select('id')
        .limit(1);

      if (error) {
        return { ok: false, latency: Date.now() - start, error: error.message };
      }
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: err.message };
    }
  }

  /**
   * @private
   */
  _createClient(schemaName, agentId, agentRole) {
    const key = this._anonKey;
    if (!key) {
      throw new Error('SUPABASE_ANON_KEY not configured. Set it in environment or .env file.');
    }

    return createClient(this._url, key, {
      db: { schema: schemaName },
      global: {
        headers: {
          'x-agent-id': agentId,
          'x-agent-role': agentRole,
        },
      },
    });
  }
}

module.exports = { DatabaseClient, VALID_SCHEMAS };
