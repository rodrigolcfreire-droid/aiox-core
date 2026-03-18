import React from 'react';
import {
  Card,
  TrendChart,
  HealthScore,
  DomainCard,
  IssuesList,
  TechDebtList,
  AutoFixLog
} from '../components';
import { useHealthData, useAutoRefresh } from '../hooks';
import './Dashboard.css';

/**
 * Main dashboard page
 */
function Dashboard() {
  const { data, loading, error, lastUpdated, refresh } = useHealthData();
  const autoRefresh = useAutoRefresh({
    interval: 30000,
    onRefresh: refresh
  });

  if (loading && !data) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading health data...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="dashboard-error">
        <h2>Error loading data</h2>
        <p>{error.message}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }

  const { overall, domains, issues, autoFixed, techDebt, history } = data || {};

  return (
    <div className="dashboard">
      {/* Header Section */}
      <div className="dashboard-header">
        <div class="dashboard-title">
          <h1>Saúde do Sistema</h1>
          <div className="dashboard-meta">
            {lastUpdated && (
              <span className="last-updated">
                Última atualização: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              className="refresh-btn"
              onClick={refresh}
              disabled={autoRefresh.isRefreshing}
            >
              {autoRefresh.isRefreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>
        <div className="auto-refresh-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh.isEnabled}
              onChange={autoRefresh.toggle}
            />
            <span>Auto-atualizar</span>
          </label>
          {autoRefresh.isEnabled && (
            <span className="countdown">Próxima: {autoRefresh.countdown}s</span>
          )}
        </div>
      </div>

      {/* Overview Section */}
      <div className="dashboard-overview">
        <Card className="overview-score">
          <div className="score-content">
            <HealthScore score={overall?.score || 0} size="xl" />
            <div className="score-stats">
              <div className="stat">
                <span className="stat-value">{overall?.issuesCount || 0}</span>
                <span className="stat-label">Problemas</span>
              </div>
              <div className="stat stat--success">
                <span className="stat-value">{overall?.autoFixedCount || 0}</span>
                <span className="stat-label">Correção Automática</span>
              </div>
              {history?.scoreDelta !== undefined && (
                <div className={`stat ${history.scoreDelta >= 0 ? 'stat--success' : 'stat--danger'}`}>
                  <span className="stat-value">
                    {history.scoreDelta >= 0 ? '+' : ''}{history.scoreDelta}
                  </span>
                  <span className="stat-label">vs Anterior</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="overview-trend" title="TENDÊNCIA DE SAÚDE">
          <TrendChart data={history?.trend || []} height={180} />
          <p className="health-trend-desc">Essa área indica que o painel está mostrando o estado geral do sistema.</p>
        </Card>
      </div>

      {/* Domain Cards */}
      <section className="dashboard-section">
        <h2 className="section-title">Saúde por Domínio</h2>
        <div className="domain-grid">
          {domains && Object.entries(domains).map(([domainId, domainData]) => (
            <DomainCard
              key={domainId}
              domain={domainId}
              data={domainData}
            />
          ))}
        </div>
      </section>

      {/* Issues and Actions */}
      <section className="dashboard-section">
        <div className="issues-row">
          <div className="issues-col">
            <IssuesList issues={issues} maxItems={5} />
          </div>
          <div className="issues-col">
            <div className="stacked-panels">
              <AutoFixLog items={autoFixed} maxItems={3} />
              <TechDebtList items={techDebt} maxItems={3} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>
          AIOX Health Check v{data?.version || '1.0.0'} |
          Mode: {data?.mode || 'full'} |
          Duration: {data?.duration || 'N/A'}
        </p>
      </footer>
    </div>
  );
}

export default Dashboard;
