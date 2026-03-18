import React from 'react';

const SEVERITY_CONFIG = {
  HIGH: { icon: '\u274C', color: 'var(--color-severity-critical)', label: 'HIGH' },
  WARNING: { icon: '\u26A0\uFE0F', color: 'var(--color-severity-medium)', label: 'WARNING' },
  INFO: { icon: '\u2139\uFE0F', color: 'var(--color-info)', label: 'INFO' },
};

/**
 * Alerts Panel — Shows system alerts by severity
 */
function AlertsPanel({ alerts, expanded = false }) {
  if (!alerts) return null;

  const high = alerts.filter(a => a.severity === 'HIGH');
  const warning = alerts.filter(a => a.severity === 'WARNING');
  const info = alerts.filter(a => a.severity === 'INFO');

  const displayAlerts = expanded ? alerts : alerts.slice(0, 5);

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Alertas do Sistema</h2>
        <div className="sentinel-section-stats">
          {high.length > 0 && <span className="stat-badge stat-badge--critical">{high.length} HIGH</span>}
          {warning.length > 0 && <span className="stat-badge stat-badge--warning">{warning.length} WARNING</span>}
          {info.length > 0 && <span className="stat-badge stat-badge--info">{info.length} INFO</span>}
        </div>
      </div>

      <div className="alerts-list">
        {displayAlerts.length === 0 ? (
          <div className="alerts-empty">Nenhum alerta. Sistema saudavel.</div>
        ) : (
          displayAlerts.map((alert, idx) => {
            const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
            return (
              <div key={idx} className={`alert-item alert-item--${alert.severity.toLowerCase()}`}>
                <span className="alert-icon">{config.icon}</span>
                <span className="alert-severity" style={{ color: config.color }}>{config.label}</span>
                <span className="alert-message">{alert.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default AlertsPanel;
