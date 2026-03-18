import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './AgentPanel.css';

const STATUS_CONFIG = {
  active: { icon: '\u2705', label: 'Ativo', color: 'var(--color-healthy)' },
  ready: { icon: '\uD83D\uDFE2', label: 'Pronto', color: 'var(--color-accent)' },
  idle: { icon: '\uD83D\uDFE1', label: 'Idle', color: 'var(--color-degraded)' },
  stale: { icon: '\uD83D\uDFE0', label: 'Stale', color: 'var(--color-warning)' },
  no_memory: { icon: '\u274C', label: 'Sem Memoria', color: 'var(--color-critical)' },
};

function AgentDetail() {
  const { agentId } = useParams();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/data/agent-detail-${agentId}.json`);
        if (!response.ok) throw new Error(`Agent "${agentId}" not found. Run: node bin/agent-panel.js --dashboard`);
        const json = await response.json();
        setAgent(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  if (loading) {
    return (
      <div className="ap-loading">
        <div className="ap-loading-icon">{'\uD83E\uDD16'}</div>
        <p>Carregando agente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ap-error">
        <h2>Agente nao encontrado</h2>
        <p>{error}</p>
        <Link to="/agents" className="ad-back-link">{'\u2190'} Voltar ao Painel</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.no_memory;
  const isSentinel = agent.id === 'autoavaliativo';

  const sections = [
    { id: 'overview', label: 'Visao Geral' },
    { id: 'commands', label: 'Comandos' },
    { id: 'memory', label: 'Memoria' },
    { id: 'activity', label: 'Atividade' },
  ];
  if (isSentinel) {
    sections.push({ id: 'sentinel', label: 'Sentinel Reports' });
  }

  return (
    <div className="ad-container">
      {/* Breadcrumb */}
      <div className="ad-breadcrumb">
        <Link to="/">Dashboard</Link>
        <span className="ad-breadcrumb-sep">/</span>
        <Link to="/agents">Agentes</Link>
        <span className="ad-breadcrumb-sep">/</span>
        <span className="ad-breadcrumb-current">{agent.persona_name}</span>
      </div>

      {/* Header */}
      <div className="ad-header">
        <div className="ad-header-left">
          <span className="ad-agent-icon">{agent.icon}</span>
          <div>
            <h1 className="ad-agent-name">{agent.persona_name}</h1>
            <span className="ad-agent-tag">{agent.tag}</span>
            <p className="ad-agent-title">{agent.title}</p>
          </div>
        </div>
        <div className="ad-header-right">
          <span className="ad-status-badge" style={{ color: statusCfg.color, borderColor: statusCfg.color }}>
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="ad-summary">
        <div className="ad-summary-card">
          <span className="ad-summary-value">{agent.memory.lines}</span>
          <span className="ad-summary-label">Linhas Memoria</span>
        </div>
        <div className="ad-summary-card">
          <span className="ad-summary-value">{agent.activity.commits_30d}</span>
          <span className="ad-summary-label">Commits 30d</span>
        </div>
        <div className="ad-summary-card">
          <span className="ad-summary-value">{agent.commands_count || agent.commands?.length || 0}</span>
          <span className="ad-summary-label">Comandos</span>
        </div>
        <div className="ad-summary-card">
          <span className="ad-summary-value">{agent.squads.length}</span>
          <span className="ad-summary-label">Squads</span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="ad-tabs">
        {sections.map(s => (
          <button
            key={s.id}
            className={`ad-tab ${activeSection === s.id ? 'ad-tab--active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ad-content">
        {activeSection === 'overview' && (
          <div className="ad-section">
            <div className="ad-info-grid">
              <div className="ad-info-row">
                <span className="ad-info-label">Role</span>
                <span className="ad-info-value">{agent.role}</span>
              </div>
              <div className="ad-info-row">
                <span className="ad-info-label">When to Use</span>
                <span className="ad-info-value">{agent.when_to_use || 'N/A'}</span>
              </div>
              <div className="ad-info-row">
                <span className="ad-info-label">Archetype</span>
                <span className="ad-info-value">{agent.archetype || 'N/A'}</span>
              </div>
              <div className="ad-info-row">
                <span className="ad-info-label">Squads</span>
                <span className="ad-info-value">
                  {agent.squads.length > 0
                    ? agent.squads.map(s => (
                        <span key={s} className="ap-card-squad-tag">{s}</span>
                      ))
                    : 'Nenhum (agente individual)'}
                </span>
              </div>
              <div className="ad-info-row">
                <span className="ad-info-label">Ultima Modificacao</span>
                <span className="ad-info-value">
                  {agent.activity.last_file_modified
                    ? new Date(agent.activity.last_file_modified).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
              <div className="ad-info-row">
                <span className="ad-info-label">Memoria Atualizada</span>
                <span className="ad-info-value">
                  {agent.activity.last_memory_update
                    ? new Date(agent.activity.last_memory_update).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'commands' && (
          <div className="ad-section">
            <h3 className="ad-section-title">Comandos Disponiveis ({agent.commands?.length || 0})</h3>
            {agent.commands && agent.commands.length > 0 ? (
              <div className="ad-commands-list">
                {agent.commands.map((cmd, idx) => (
                  <div key={idx} className="ad-command-item">
                    <code className="ad-command-name">*{cmd.name}</code>
                    <span className="ad-command-desc">{cmd.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-empty">Nenhum comando registrado.</p>
            )}
          </div>
        )}

        {activeSection === 'memory' && (
          <div className="ad-section">
            <h3 className="ad-section-title">
              Memoria do Agente
              {agent.memory.exists && (
                <span className="ad-section-badge">
                  {agent.memory.lines} linhas | {agent.memory.age_days}d atras
                </span>
              )}
            </h3>
            {agent.memory_content ? (
              <pre className="ad-memory-content">{agent.memory_content}</pre>
            ) : (
              <div className="ad-empty">
                <p>Este agente nao possui MEMORY.md.</p>
                <p className="ad-empty-hint">
                  Crie em: <code>.aiox-core/development/agents/{agent.id}/MEMORY.md</code>
                </p>
              </div>
            )}
          </div>
        )}

        {activeSection === 'activity' && (
          <div className="ad-section">
            <h3 className="ad-section-title">Atividade Recente (30 dias)</h3>
            <div className="ad-activity-stats">
              <span><strong>{agent.activity.commits_30d}</strong> commits mencionando este agente</span>
            </div>
            {agent.recent_commits && agent.recent_commits.length > 0 ? (
              <div className="ad-commits-list">
                {agent.recent_commits.map((commit, idx) => (
                  <div key={idx} className="ad-commit-item">
                    <code>{commit}</code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-empty">Nenhuma atividade nos ultimos 30 dias.</p>
            )}
          </div>
        )}

        {activeSection === 'sentinel' && isSentinel && agent.sentinel && (
          <div className="ad-section">
            <h3 className="ad-section-title">Relatorios Sentinel</h3>
            {agent.sentinel.reports.length > 0 ? (
              <div className="ad-sentinel-reports">
                {agent.sentinel.reports.map((report, idx) => (
                  <div key={idx} className="ad-sentinel-report">
                    <div className="ad-sentinel-report-header">
                      <span className="ad-sentinel-date">{report.date}</span>
                      <span className="ad-sentinel-time">
                        {report.timestamp?.split('T')[1]?.split('.')[0]}
                      </span>
                    </div>
                    {report.summary && (
                      <div className="ad-sentinel-metrics">
                        <span className="ad-sentinel-metric">
                          <strong>{report.summary.agents}</strong> agentes
                        </span>
                        <span className="ad-sentinel-metric">
                          <strong>{report.summary.squads}</strong> squads
                        </span>
                        <span className="ad-sentinel-metric ad-sentinel-metric--high">
                          <strong>{report.summary.alerts_high}</strong> HIGH
                        </span>
                        <span className="ad-sentinel-metric ad-sentinel-metric--warn">
                          <strong>{report.summary.alerts_warning}</strong> WARN
                        </span>
                        <span className="ad-sentinel-metric">
                          <strong>{report.summary.pending_stories}</strong> pendentes
                        </span>
                      </div>
                    )}
                    {report.alerts && report.alerts.length > 0 && (
                      <div className="ad-sentinel-alerts">
                        {report.alerts.slice(0, 5).map((alert, aidx) => (
                          <div key={aidx} className={`ad-sentinel-alert ad-sentinel-alert--${alert.severity.toLowerCase()}`}>
                            <span className="ad-sentinel-alert-severity">{alert.severity}</span>
                            <span>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-empty">Nenhum relatorio Sentinel encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentDetail;
