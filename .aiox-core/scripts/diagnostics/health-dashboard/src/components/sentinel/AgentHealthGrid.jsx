import React from 'react';

/**
 * Agent Health Grid — Shows all agents with their health status
 */
function AgentHealthGrid({ agentHealth }) {
  if (!agentHealth) return null;

  const { agents, with_memory, without_memory, total } = agentHealth;

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Saude dos Agentes</h2>
        <div className="sentinel-section-stats">
          <span className="stat-badge stat-badge--ok">{with_memory} com memoria</span>
          {without_memory > 0 && (
            <span className="stat-badge stat-badge--warning">{without_memory} sem memoria</span>
          )}
          <span className="stat-badge">{total} total</span>
        </div>
      </div>

      <div className="agent-grid">
        {agents.map(agent => (
          <div
            key={agent.id}
            className={`agent-card ${!agent.has_memory ? 'agent-card--warning' : ''} ${agent.memory_age_days > 7 ? 'agent-card--stale' : ''}`}
          >
            <div className="agent-card-header">
              <span className={`agent-status ${agent.has_memory ? 'agent-status--ok' : 'agent-status--error'}`} />
              <span className="agent-name">{agent.id}</span>
            </div>
            <div className="agent-card-body">
              {agent.has_memory ? (
                <>
                  <div className="agent-stat">
                    <span className="agent-stat-label">Memoria</span>
                    <span className="agent-stat-value">{agent.memory_lines} linhas</span>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-label">Idade</span>
                    <span className={`agent-stat-value ${agent.memory_age_days > 7 ? 'text-warning' : ''}`}>
                      {agent.memory_age_days}d
                    </span>
                  </div>
                </>
              ) : (
                <div className="agent-no-memory">Sem MEMORY.md</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentHealthGrid;
