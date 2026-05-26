'use strict';

// Test helper: injects valid AIOS session credentials into requests so unit tests
// against api-server (handleRequest or HTTP-bound server) bypass auth without
// modifying production code. See AC #6 of av-auth-tests-restore.

const crypto = require('crypto');

// Mirror api-server.js logic exactly: env override defaults to 'aios2026'.
// IMPORTANT: the env var is AIOS_PASSWORD (api-server.js line 119), not AUTH_PASSWORD.
const AUTH_PASSWORD = process.env.AIOS_PASSWORD || 'aios2026';
const AUTH_COOKIE = 'aios_session';

function getAuthToken() {
  try {
    return crypto
      .createHash('sha256')
      .update(AUTH_PASSWORD)
      .digest('hex')
      .substring(0, 32);
  } catch (err) {
    throw new Error(`auth-mock: failed to derive token: ${err.message}`);
  }
}

const AUTH_TOKEN = getAuthToken();

/**
 * Mutate a mock request object so it carries a valid aios_session cookie.
 * Returns the same request for chaining.
 */
function injectAuthCookie(req) {
  if (!req || typeof req !== 'object') {
    throw new Error('auth-mock: injectAuthCookie requires a request object');
  }
  if (!req.headers || typeof req.headers !== 'object') {
    req.headers = {};
  }
  const existing = req.headers.cookie ? `${req.headers.cookie}; ` : '';
  req.headers.cookie = `${existing}${AUTH_COOKIE}=${AUTH_TOKEN}`;
  return req;
}

/**
 * Return the cookie string ready to be set on an HTTP client request:
 *   opts.headers.Cookie = getAuthCookieHeader();
 */
function getAuthCookieHeader() {
  return `${AUTH_COOKIE}=${AUTH_TOKEN}`;
}

/**
 * Return a Bearer header value for tests preferring Authorization over Cookie.
 */
function getAuthBearer() {
  return `Bearer ${AUTH_TOKEN}`;
}

/**
 * Append `?token=...` to a URL path (handles existing query strings).
 */
function withAuthQuery(urlPath) {
  if (typeof urlPath !== 'string' || urlPath.length === 0) {
    throw new Error('auth-mock: withAuthQuery requires a URL path string');
  }
  const sep = urlPath.includes('?') ? '&' : '?';
  return `${urlPath}${sep}token=${AUTH_TOKEN}`;
}

module.exports = {
  AUTH_COOKIE,
  AUTH_TOKEN,
  getAuthToken,
  injectAuthCookie,
  getAuthCookieHeader,
  getAuthBearer,
  withAuthQuery,
};
