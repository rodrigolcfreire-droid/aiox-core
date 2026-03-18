import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../shared';
import AgentHealthGrid from './AgentHealthGrid';
import SquadPerformance from './SquadPerformance';
import DatabaseMonitor from './DatabaseMonitor';
import AlertsPanel from './AlertsPanel';
import PendenciesPanel from './PendenciesPanel';
import SystemMetrics from './SystemMetrics';
import ReportHistory from './ReportHistory';
import './SentinelDashboard.css';

/**
 * Main Sentinel Dashboard — AIOS Autoavaliativo Agent Panel
 * Observability layer for the Sentinel governance agent.
 * READ-ONLY: This dashboard observes, never controls.
 */
function SentinelDashboard() {
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/data/sentinel-report.json');
      if (!response.ok) throw new Error('Failed to load report. Run: node bin/sentinel-report.js --dashboard');
      const data = await response.json();
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/data/sentinel-history.json');
      if (!response.ok) return;
      const data = await response.json();
      setHistory(data);
    } catch {
      /* History is non-critical */
    }
  }, []);

  useEffect(() => {
    loadReport();
    loadHistory();
  }, [loadReport, loadHistory]);

  if (loading && !report) {
    return (
      <div className="sentinel-loading">
        <div className="sentinel-loading-icon">🔍</div>
        <p>Sentinel analyzing system...</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="sentinel-error">
        <h2>Sentinel Offline</h2>
        <p>{error}</p>
        <button className="sentinel-btn" onClick={loadReport}>Retry</button>
      </div>
    );
  }

  const { sections, summary } = report || {};
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'agents', label: 'Agentes', icon: '🤖' },
    { id: 'squads', label: 'Squads', icon: '👥' },
    { id: 'database', label: 'Banco de Dados', icon: '🗄️' },
    { id: 'alerts', label: 'Alertas', icon: '🚨' },
    { id: 'history', label: 'Historico', icon: '📋' },
  ];

  return (
    <div className="sentinel-dashboard">
      {/* Header */}
      <div className="sentinel-header">
        <div className="sentinel-title">
          <span className="sentinel-icon">🔍</span>
          <div>
            <h1>Sentinel — Centro de Comando</h1>
            <p className="sentinel-subtitle">
              AIOS Autoavaliativo | Last scan: {report?.timestamp ? new Date(report.timestamp).toLocaleString() : 'N/A'}
            </p>
          </div>
        </div>
        <button className="sentinel-btn sentinel-btn--refresh" onClick={loadReport}>
          Refresh
        </button>
      </div>

      {/* Quick Metrics Bar */}
      {summary && (
        <div className="sentinel-metrics-bar">
          <div className="sentinel-metric">
            <span className="sentinel-metric-value">{summary.agents}</span>
            <span className="sentinel-metric-label">Agentes</span>
          </div>
          <div className="sentinel-metric">
            <span className="sentinel-metric-value">{summary.squads}</span>
            <span className="sentinel-metric-label">Squads</span>
          </div>
          <div className="sentinel-metric">
            <span className="sentinel-metric-value">{summary.skills}</span>
            <span className="sentinel-metric-label">Skills</span>
          </div>
          <div className="sentinel-metric">
            <span className="sentinel-metric-value">{summary.stories}</span>
            <span className="sentinel-metric-label">Stories</span>
          </div>
          <div className={`sentinel-metric ${summary.alerts_high > 0 ? 'sentinel-metric--critical' : ''}`}>
            <span className="sentinel-metric-value">
              {summary.alerts_high + summary.alerts_warning}
            </span>
            <span className="sentinel-metric-label">Alertas</span>
          </div>
          <div className="sentinel-metric">
            <span className="sentinel-metric-value">{summary.uncommitted_files}</span>
            <span className="sentinel-metric-label">Uncommitted</span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="sentinel-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`sentinel-tab ${activeTab === tab.id ? 'sentinel-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="sentinel-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="sentinel-content">
        {activeTab === 'overview' && sections && (
          <div className="sentinel-grid">
            <SystemMetrics
              activity={sections.activity}
              systemState={sections.system_state}
              memory={sections.memory}
            />
            <AlertsPanel alerts={sections.alerts} />
            <PendenciesPanel pendencies={sections.pendencies} />
          </div>
        )}

        {activeTab === 'agents' && sections && (
          <AgentHealthGrid agentHealth={sections.agent_health} />
        )}

        {activeTab === 'squads' && sections && (
          <SquadPerformance squadPerformance={sections.squad_performance} />
        )}

        {activeTab === 'database' && sections && (
          <DatabaseMonitor database={sections.database} />
        )}

        {activeTab === 'alerts' && sections && (
          <div className="sentinel-grid">
            <AlertsPanel alerts={sections.alerts} expanded />
            <PendenciesPanel pendencies={sections.pendencies} expanded />
          </div>
        )}

        {activeTab === 'history' && (
          <ReportHistory history={history} />
        )}
      </div>
    </div>
  );
}

export default SentinelDashboard;
