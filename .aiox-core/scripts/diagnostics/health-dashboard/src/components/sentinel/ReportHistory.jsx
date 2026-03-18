import React from 'react';

/**
 * Report History — Shows historical Sentinel reports
 */
function ReportHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="sentinel-section">
        <div className="sentinel-section-header">
          <h2>Historico de Relatorios</h2>
        </div>
        <div className="history-empty">
          Nenhum relatorio salvo ainda. Execute <code>node bin/sentinel-report.js</code> para gerar o primeiro.
        </div>
      </div>
    );
  }

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Historico de Relatorios</h2>
        <span className="stat-badge">{history.length} relatorios</span>
      </div>

      <div className="history-list">
        {history.map((entry, idx) => (
          <div key={idx} className="history-item">
            <div className="history-item-header">
              <span className="history-date">{entry.date}</span>
              <span className="history-time">
                {entry.timestamp ? entry.timestamp.split('T')[1]?.split('.')[0] : ''}
              </span>
            </div>
            {entry.summary && (
              <div className="history-item-body">
                <div className="history-metrics">
                  <span className="history-metric">
                    <strong>{entry.summary.agents}</strong> agentes
                  </span>
                  <span className="history-metric">
                    <strong>{entry.summary.squads}</strong> squads
                  </span>
                  <span className="history-metric">
                    <strong>{entry.summary.alerts_high}</strong> HIGH
                  </span>
                  <span className="history-metric">
                    <strong>{entry.summary.alerts_warning}</strong> WARN
                  </span>
                  <span className="history-metric">
                    <strong>{entry.summary.pending_stories}</strong> pendentes
                  </span>
                  <span className="history-metric">
                    <strong>{entry.summary.uncommitted_files}</strong> uncommitted
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReportHistory;
