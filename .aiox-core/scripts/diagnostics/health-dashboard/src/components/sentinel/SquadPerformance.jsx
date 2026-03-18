import React from 'react';

/**
 * Squad Performance — Shows squad metrics and status
 */
function SquadPerformance({ squadPerformance }) {
  if (!squadPerformance) return null;

  const { squads, total } = squadPerformance;

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Performance dos Squads</h2>
        <span className="stat-badge">{total} squads</span>
      </div>

      <div className="squad-grid">
        {squads.map(squad => (
          <div key={squad.id} className="squad-card">
            <div className="squad-card-header">
              <h3 className="squad-name">{squad.id}</h3>
              <span className={`squad-status squad-status--${squad.status}`}>
                {squad.status}
              </span>
            </div>
            <div className="squad-card-body">
              <div className="squad-stat">
                <span className="squad-stat-label">Membros</span>
                <span className="squad-stat-value">{squad.members_count}</span>
              </div>
              <div className="squad-stat">
                <span className="squad-stat-label">Ultima atividade</span>
                <span className="squad-stat-value">{squad.last_activity || 'N/A'}</span>
              </div>
              {squad.members.length > 0 && (
                <div className="squad-members">
                  {squad.members.map(m => (
                    <span key={m} className="squad-member-tag">{m}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SquadPerformance;
