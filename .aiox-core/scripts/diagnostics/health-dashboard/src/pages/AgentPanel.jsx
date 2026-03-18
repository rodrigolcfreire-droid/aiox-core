import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AgentPanel.css';

const STATUS_CONFIG = {
  active: { icon: '\u2705', label: 'Ativo', color: 'var(--color-healthy)' },
  ready: { icon: '\uD83D\uDFE2', label: 'Pronto', color: 'var(--color-accent)' },
  idle: { icon: '\uD83D\uDFE1', label: 'Idle', color: 'var(--color-degraded)' },
  stale: { icon: '\uD83D\uDFE0', label: 'Stale', color: 'var(--color-warning)' },
  no_memory: { icon: '\u274C', label: 'Sem Memoria', color: 'var(--color-critical)' },
};

function AgentPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/data/agent-panel.json');
        if (!response.ok) throw new Error('Run: node bin/agent-panel.js --dashboard');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="ap-loading">
        <div className="ap-loading-icon">{'\uD83E\uDD16'}</div>
        <p>Carregando agentes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ap-error">
        <h2>Painel de Agentes Offline</h2>
        <p>{error}</p>
        <code>node bin/agent-panel.js --dashboard</code>
      </div>
    );
  }

  const { agents, stats } = data;
  const filtered = filter === 'all'
    ? agents
    : filter === 'with_squad'
      ? agents.filter(a => a.has_squad)
      : filter === 'without_squad'
        ? agents.filter(a => !a.has_squad)
        : agents.filter(a => a.status === filter);

  return (
    <div className="ap-container">
      {/* Header */}
      <div className="ap-header">
        <div className="ap-title">
          <span className="ap-icon">{'\uD83E\uDD16'}</span>
          <div>
            <h1>Painel de Agentes</h1>
            <p className="ap-subtitle">
              Visualizacao e gerenciamento de agentes individuais
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="ap-stats-bar">
        <div className="ap-stat">
          <span className="ap-stat-value">{stats.total}</span>
          <span className="ap-stat-label">Total</span>
        </div>
        <div className="ap-stat ap-stat--active">
          <span className="ap-stat-value">{stats.active}</span>
          <span className="ap-stat-label">Ativos</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-value">{stats.ready}</span>
          <span className="ap-stat-label">Prontos</span>
        </div>
        <div className={`ap-stat ${stats.no_memory > 0 ? 'ap-stat--warning' : ''}`}>
          <span className="ap-stat-value">{stats.no_memory}</span>
          <span className="ap-stat-label">Sem Memoria</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-value">{stats.with_squad}</span>
          <span className="ap-stat-label">Em Squads</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-value">{stats.without_squad}</span>
          <span className="ap-stat-label">Individuais</span>
        </div>
      </div>

      {/* Filters */}
      <div className="ap-filters">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'active', label: 'Ativos' },
          { id: 'no_memory', label: 'Sem Memoria' },
          { id: 'with_squad', label: 'Em Squads' },
          { id: 'without_squad', label: 'Individuais' },
        ].map(f => (
          <button
            key={f.id}
            className={`ap-filter ${filter === f.id ? 'ap-filter--active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Agent Grid */}
      <div className="ap-grid">
        {filtered.map(agent => {
          const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.no_memory;
          return (
            <Link
              key={agent.id}
              to={`/agents/${agent.id}`}
              className="ap-card"
            >
              <div className="ap-card-header">
                <span className="ap-card-icon">{agent.icon}</span>
                <div className="ap-card-identity">
                  <span className="ap-card-name">{agent.persona_name}</span>
                  <span className="ap-card-tag">{agent.tag}</span>
                </div>
                <span
                  className="ap-card-status"
                  style={{ color: statusCfg.color }}
                  title={statusCfg.label}
                >
                  {statusCfg.icon}
                </span>
              </div>

              <p className="ap-card-title">{agent.title}</p>

              <div className="ap-card-meta">
                <span className="ap-card-meta-item">
                  <strong>{agent.memory.lines}</strong> linhas memoria
                </span>
                <span className="ap-card-meta-item">
                  <strong>{agent.activity.commits_30d}</strong> commits 30d
                </span>
                <span className="ap-card-meta-item">
                  <strong>{agent.commands_count}</strong> comandos
                </span>
              </div>

              {agent.squads.length > 0 && (
                <div className="ap-card-squads">
                  {agent.squads.map(s => (
                    <span key={s} className="ap-card-squad-tag">{s}</span>
                  ))}
                </div>
              )}

              <div className="ap-card-footer">
                <span className="ap-card-status-label" style={{ color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
                <span className="ap-card-arrow">{'\u2192'}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default AgentPanel;
