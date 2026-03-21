#!/usr/bin/env node
'use strict';

/**
 * security-monitor.js — System security monitoring
 * Story: AV-12 (Security Module)
 *
 * Tracks access attempts, active services, rate limit hits,
 * and provides real-time security status.
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// In-memory security log
const securityLog = [];
const MAX_LOG_SIZE = 500;

/**
 * Log a security event.
 */
function logSecurityEvent(type, data) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    ...data,
  };
  securityLog.push(event);
  if (securityLog.length > MAX_LOG_SIZE) {
    securityLog.splice(0, securityLog.length - MAX_LOG_SIZE);
  }
  return event;
}

/**
 * Log an API access.
 */
function logAccess(req) {
  const ip = req.socket.remoteAddress || '127.0.0.1';
  const method = req.method;
  const url = req.url;
  const userAgent = req.headers['user-agent'] || 'unknown';

  logSecurityEvent('access', { ip, method, url, userAgent });
}

/**
 * Log a rate limit hit.
 */
function logRateLimitHit(req) {
  const ip = req.socket.remoteAddress || '127.0.0.1';
  logSecurityEvent('rate_limit', { ip, url: req.url });
}

/**
 * Log a blocked request.
 */
function logBlocked(req, reason) {
  const ip = req.socket.remoteAddress || '127.0.0.1';
  logSecurityEvent('blocked', { ip, url: req.url, reason });
}

/**
 * Get active services status.
 */
function getActiveServices() {
  const services = [];

  // AV Server
  services.push({
    name: 'AV API Server',
    port: 3456,
    status: 'active',
    bind: '127.0.0.1',
  });

  // Check if FFmpeg is available
  try {
    const version = execSync('ffmpeg -version 2>&1 | head -1', { stdio: 'pipe', timeout: 5000 }).toString().trim();
    services.push({ name: 'FFmpeg', status: 'active', version: version.split(' ')[2] || 'unknown' });
  } catch {
    services.push({ name: 'FFmpeg', status: 'inactive' });
  }

  // Check Node.js
  services.push({
    name: 'Node.js',
    status: 'active',
    version: process.version,
    pid: process.pid,
    uptime: Math.floor(process.uptime()) + 's',
  });

  return services;
}

/**
 * Get firewall status.
 */
function getFirewallStatus() {
  try {
    const output = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1', { stdio: 'pipe', timeout: 5000 }).toString().trim();
    return { enabled: output.includes('enabled'), raw: output };
  } catch {
    return { enabled: false, raw: 'Could not check firewall' };
  }
}

/**
 * Get comprehensive security status.
 */
function getSecurityStatus() {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const fiveMinAgo = now - 300000;

  const recentEvents = securityLog.filter(e => new Date(e.timestamp).getTime() > oneHourAgo);
  const veryRecentEvents = securityLog.filter(e => new Date(e.timestamp).getTime() > fiveMinAgo);

  const rateLimitHits = recentEvents.filter(e => e.type === 'rate_limit');
  const blockedRequests = recentEvents.filter(e => e.type === 'blocked');
  const accessEvents = recentEvents.filter(e => e.type === 'access');

  // Unique IPs
  const uniqueIPs = new Set(accessEvents.map(e => e.ip));

  // Determine overall status
  let status = 'secure';
  const alerts = [];

  if (rateLimitHits.length > 5) {
    status = 'warning';
    alerts.push({ level: 'warning', message: `${rateLimitHits.length} rate limit hits na ultima hora` });
  }
  if (blockedRequests.length > 0) {
    status = 'warning';
    alerts.push({ level: 'warning', message: `${blockedRequests.length} requests bloqueados` });
  }
  if (rateLimitHits.length > 20) {
    status = 'risk';
    alerts.push({ level: 'critical', message: 'Possivel ataque — muitos rate limit hits' });
  }

  const firewall = getFirewallStatus();
  if (!firewall.enabled) {
    status = 'risk';
    alerts.push({ level: 'critical', message: 'Firewall DESATIVADO' });
  }

  // Check if API key is exposed
  const apiKeyInZshrc = fs.existsSync(os.homedir() + '/.zshrc')
    ? fs.readFileSync(os.homedir() + '/.zshrc', 'utf8').includes('sk-ant-')
    : false;
  if (apiKeyInZshrc) {
    alerts.push({ level: 'warning', message: 'API key exposta em ~/.zshrc' });
  }

  const network = getNetworkConnections();

  if (network.inbound > 0) {
    status = 'warning';
    alerts.push({ level: 'warning', message: `${network.inbound} conexao(oes) de entrada detectada(s)` });
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    firewall,
    network,
    services: getActiveServices(),
    stats: {
      totalAccessLastHour: accessEvents.length,
      totalAccessLast5min: veryRecentEvents.filter(e => e.type === 'access').length,
      rateLimitHits: rateLimitHits.length,
      blockedRequests: blockedRequests.length,
      uniqueIPs: uniqueIPs.size,
      uptime: Math.floor(process.uptime()) + 's',
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
    },
    alerts,
    recentEvents: securityLog.slice(-20).reverse(),
    system: {
      platform: os.platform(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemoryGB: (os.totalmem() / 1073741824).toFixed(1),
      freeMemoryGB: (os.freemem() / 1073741824).toFixed(1),
    },
  };
}

/**
 * Get active network connections (external only).
 * Detects who is connecting TO this machine and FROM this machine.
 */
function getNetworkConnections() {
  try {
    const output = execSync('netstat -an 2>/dev/null | grep ESTABLISHED', { stdio: 'pipe', timeout: 5000 }).toString();
    const lines = output.trim().split('\n').filter(Boolean);

    const connections = [];
    const inbound = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const local = parts[3] || '';
      const remote = parts[4] || '';

      // Skip localhost
      if (remote.startsWith('127.0.0.1') || remote.startsWith('::1')) continue;

      const remoteIP = remote.replace(/\.\d+$/, '');
      const remotePort = remote.split('.').pop();
      const localPort = local.split('.').pop();

      const conn = {
        localPort,
        remoteIP,
        remotePort,
        direction: 'outbound',
      };

      // If local port is a known service port, it's inbound
      const servicePorts = ['3456', '22', '80', '443', '8080'];
      if (servicePorts.includes(localPort)) {
        conn.direction = 'inbound';
        inbound.push(conn);
      }

      connections.push(conn);
    }

    // Log inbound connections as security events
    for (const conn of inbound) {
      logSecurityEvent('inbound_connection', {
        ip: conn.remoteIP,
        port: conn.localPort,
        remotePort: conn.remotePort,
      });
    }

    return {
      total: connections.length,
      outbound: connections.filter(c => c.direction === 'outbound').length,
      inbound: inbound.length,
      connections: connections.slice(0, 20),
      inboundDetails: inbound,
    };
  } catch {
    return { total: 0, outbound: 0, inbound: 0, connections: [], inboundDetails: [] };
  }
}

module.exports = {
  logSecurityEvent,
  logAccess,
  logRateLimitHit,
  logBlocked,
  getSecurityStatus,
  getActiveServices,
  getFirewallStatus,
  getNetworkConnections,
};
