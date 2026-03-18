/**
 * AIOX Schema Client
 *
 * Wraps a Supabase client bound to a specific schema with convenience methods
 * for common AIOX operations: list, get, create, update.
 *
 * @module core/db/schema-client
 * @version 1.0.0
 */

class SchemaClient {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} client
   * @param {string} schemaName
   * @param {string} agentId
   * @param {string} agentRole
   */
  constructor(client, schemaName, agentId, agentRole) {
    this._client = client;
    this._schema = schemaName;
    this._agentId = agentId;
    this._agentRole = agentRole;
  }

  /**
   * Get the raw Supabase client for advanced queries.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  get raw() {
    return this._client;
  }

  /**
   * List rows from a table with optional filters.
   * @param {string} table - Table name
   * @param {object} [options]
   * @param {string} [options.select='*'] - Columns to select
   * @param {object} [options.filters] - Key-value equality filters
   * @param {string} [options.orderBy] - Column to order by
   * @param {boolean} [options.ascending=true] - Sort direction
   * @param {number} [options.limit=100] - Max rows
   * @returns {Promise<{data: Array, error: object|null}>}
   */
  async list(table, options = {}) {
    const {
      select = '*',
      filters = {},
      orderBy,
      ascending = true,
      limit = 100,
    } = options;

    try {
      let query = this._client.from(table).select(select);

      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }

      if (orderBy) {
        query = query.order(orderBy, { ascending });
      }

      query = query.limit(limit);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to list ${this._schema}.${table}: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (err) {
      return { data: [], error: err.message };
    }
  }

  /**
   * Get a single row by ID.
   * @param {string} table - Table name
   * @param {string} id - UUID
   * @param {string} [select='*'] - Columns to select
   * @returns {Promise<{data: object|null, error: object|null}>}
   */
  async get(table, id, select = '*') {
    try {
      const { data, error } = await this._client
        .from(table)
        .select(select)
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(`Failed to get ${this._schema}.${table}/${id}: ${error.message}`);
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }

  /**
   * Get a single row by a unique text field.
   * @param {string} table - Table name
   * @param {string} field - Field name (e.g. 'agent_id', 'persona_id')
   * @param {string} value - Field value
   * @param {string} [select='*'] - Columns to select
   * @returns {Promise<{data: object|null, error: object|null}>}
   */
  async getBy(table, field, value, select = '*') {
    try {
      const { data, error } = await this._client
        .from(table)
        .select(select)
        .eq(field, value)
        .single();

      if (error) {
        throw new Error(`Failed to get ${this._schema}.${table} by ${field}=${value}: ${error.message}`);
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }

  /**
   * Insert one or more rows.
   * @param {string} table - Table name
   * @param {object|Array<object>} rows - Row(s) to insert
   * @returns {Promise<{data: Array, error: object|null}>}
   */
  async create(table, rows) {
    try {
      const { data, error } = await this._client
        .from(table)
        .insert(rows)
        .select();

      if (error) {
        throw new Error(`Failed to insert into ${this._schema}.${table}: ${error.message}`);
      }

      return { data: data || [], error: null };
    } catch (err) {
      return { data: [], error: err.message };
    }
  }

  /**
   * Update a row by ID.
   * @param {string} table - Table name
   * @param {string} id - UUID
   * @param {object} updates - Fields to update
   * @returns {Promise<{data: object|null, error: object|null}>}
   */
  async update(table, id, updates) {
    try {
      const { data, error } = await this._client
        .from(table)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update ${this._schema}.${table}/${id}: ${error.message}`);
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }

  /**
   * Count rows with optional filters.
   * @param {string} table - Table name
   * @param {object} [filters={}] - Key-value equality filters
   * @returns {Promise<{count: number, error: object|null}>}
   */
  async count(table, filters = {}) {
    try {
      let query = this._client
        .from(table)
        .select('*', { count: 'exact', head: true });

      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(`Failed to count ${this._schema}.${table}: ${error.message}`);
      }

      return { count: count || 0, error: null };
    } catch (err) {
      return { count: 0, error: err.message };
    }
  }
}

module.exports = { SchemaClient };
