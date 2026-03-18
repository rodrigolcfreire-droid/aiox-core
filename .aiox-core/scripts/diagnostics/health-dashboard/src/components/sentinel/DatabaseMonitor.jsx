import React from 'react';

/**
 * Database Monitor — Shows database health and hardening status
 */
function DatabaseMonitor({ database }) {
  if (!database) return null;

  const totalScripts = 6;
  const existingScripts = database.db_scripts.length;
  const progressPct = Math.round((existingScripts / totalScripts) * 100);

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Monitoramento do Banco de Dados</h2>
      </div>

      <div className="db-grid">
        {/* Phases */}
        <div className="db-card">
          <h3 className="db-card-title">Fases</h3>
          <div className="db-phases">
            <div className="db-phase db-phase--done">
              <span className="db-phase-label">Fases 1-4</span>
              <span className="db-phase-status">DONE</span>
            </div>
            <div className={`db-phase db-phase--${database.phases['5'] === 'DONE' ? 'done' : 'progress'}`}>
              <span className="db-phase-label">Fase 5</span>
              <span className="db-phase-status">{database.phases['5']}</span>
            </div>
          </div>
        </div>

        {/* Schema Stats */}
        <div className="db-card">
          <h3 className="db-card-title">Estrutura</h3>
          <div className="db-stats">
            <div className="db-stat">
              <span className="db-stat-value">{database.schemas}</span>
              <span className="db-stat-label">Schemas</span>
            </div>
            <div className="db-stat">
              <span className="db-stat-value">{database.tables}</span>
              <span className="db-stat-label">Tabelas</span>
            </div>
            <div className="db-stat">
              <span className="db-stat-value">{database.rls_policies}</span>
              <span className="db-stat-label">RLS Policies</span>
            </div>
            <div className="db-stat">
              <span className="db-stat-value">{database.migrations_count}</span>
              <span className="db-stat-label">Migrations</span>
            </div>
          </div>
        </div>

        {/* Hardening Progress */}
        <div className="db-card">
          <h3 className="db-card-title">Hardening Scripts</h3>
          <div className="db-progress">
            <div className="db-progress-bar">
              <div className="db-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="db-progress-label">{existingScripts}/{totalScripts} prontos</span>
          </div>
          {database.missing_scripts.length > 0 && (
            <div className="db-missing">
              <span className="db-missing-label">Faltam:</span>
              {database.missing_scripts.map(s => (
                <span key={s} className="db-missing-tag">{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* Credentials */}
        <div className="db-card">
          <h3 className="db-card-title">Credenciais</h3>
          <div className="db-credentials">
            {Object.entries(database.credentials).map(([key, configured]) => (
              <div key={key} className="db-credential">
                <span className={`db-credential-status ${configured ? 'db-credential--ok' : 'db-credential--missing'}`} />
                <span className="db-credential-name">{key}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DatabaseMonitor;
