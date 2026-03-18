import React from 'react';

/**
 * System Metrics — Overview cards with key system metrics
 */
function SystemMetrics({ activity, systemState, memory }) {
  if (!activity || !systemState) return null;

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Resumo do Sistema</h2>
      </div>

      <div className="metrics-grid">
        {/* Activity */}
        <div className="metrics-card">
          <h3 className="metrics-card-title">Atividade Recente</h3>
          <div className="metrics-card-body">
            <div className="metrics-stat">
              <span className="metrics-stat-value">{activity.commits_24h.length}</span>
              <span className="metrics-stat-label">Commits 24h</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{activity.commits_7d}</span>
              <span className="metrics-stat-label">Commits 7d</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{activity.modified_count}</span>
              <span className="metrics-stat-label">Modificados</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{activity.untracked_count}</span>
              <span className="metrics-stat-label">Untracked</span>
            </div>
          </div>
          {activity.last_commit && (
            <div className="metrics-footer">
              <span className="metrics-footer-label">Ultimo:</span> {activity.last_commit}
            </div>
          )}
        </div>

        {/* Memory Health */}
        {memory && (
          <div className="metrics-card">
            <h3 className="metrics-card-title">Memorias</h3>
            <div className="metrics-card-body">
              <div className="metrics-stat">
                <span className="metrics-stat-value">{memory.agent_memories}</span>
                <span className="metrics-stat-label">Com memoria</span>
              </div>
              <div className="metrics-stat">
                <span className={`metrics-stat-value ${memory.agents_without_memory > 0 ? 'text-warning' : ''}`}>
                  {memory.agents_without_memory}
                </span>
                <span className="metrics-stat-label">Sem memoria</span>
              </div>
              <div className="metrics-stat">
                <span className="metrics-stat-value">{memory.total_memory_lines}</span>
                <span className="metrics-stat-label">Total linhas</span>
              </div>
              <div className="metrics-stat">
                <span className="metrics-stat-value">{memory.project_memories}</span>
                <span className="metrics-stat-label">Projeto</span>
              </div>
            </div>
          </div>
        )}

        {/* System State */}
        <div className="metrics-card">
          <h3 className="metrics-card-title">Estado</h3>
          <div className="metrics-card-body">
            <div className="metrics-stat">
              <span className="metrics-stat-value">{systemState.agents_total}</span>
              <span className="metrics-stat-label">Agentes</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{systemState.squads_total}</span>
              <span className="metrics-stat-label">Squads</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{systemState.skills_total}</span>
              <span className="metrics-stat-label">Skills</span>
            </div>
            <div className="metrics-stat">
              <span className="metrics-stat-value">{systemState.stories_total}</span>
              <span className="metrics-stat-label">Stories</span>
            </div>
          </div>
          <div className="metrics-footer">
            <span className="metrics-footer-label">Branch:</span> {systemState.branch}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemMetrics;
