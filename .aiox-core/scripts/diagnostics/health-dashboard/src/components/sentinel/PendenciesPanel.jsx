import React from 'react';

/**
 * Pendencies Panel — Shows pending operations and tasks
 */
function PendenciesPanel({ pendencies, expanded = false }) {
  if (!pendencies) return null;

  const stories = pendencies.filter(p => p.story);
  const other = pendencies.filter(p => !p.story);

  const displayStories = expanded ? stories : stories.filter(s => s.unchecked > 0);

  return (
    <div className="sentinel-section">
      <div className="sentinel-section-header">
        <h2>Pendencias Operacionais</h2>
        <span className="stat-badge">{pendencies.length} items</span>
      </div>

      {displayStories.length > 0 && (
        <div className="pendencies-group">
          <h3 className="pendencies-group-title">Stories</h3>
          {displayStories.map((p, idx) => (
            <div key={idx} className="pendency-item">
              <div className="pendency-header">
                <span className="pendency-name">{p.story}</span>
                <span className={`pendency-status pendency-status--${p.status}`}>{p.status}</span>
              </div>
              <div className="pendency-progress">
                <div className="pendency-bar">
                  <div
                    className="pendency-bar-fill"
                    style={{
                      width: p.progress
                        ? `${(parseInt(p.progress.split('/')[0], 10) / parseInt(p.progress.split('/')[1], 10)) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="pendency-label">{p.progress} ({p.unchecked} pendentes)</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="pendencies-group">
          <h3 className="pendencies-group-title">Outros</h3>
          {other.map((p, idx) => (
            <div key={idx} className="pendency-item pendency-item--other">
              {p.type === 'missing_scripts' && (
                <div>
                  <span className="pendency-label">Scripts faltando: </span>
                  {p.items.map(item => (
                    <span key={item} className="pendency-tag">{item}</span>
                  ))}
                </div>
              )}
              {p.type === 'missing_credential' && (
                <div>
                  <span className="pendency-label">Credencial faltando: </span>
                  <span className="pendency-tag pendency-tag--critical">{p.item}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PendenciesPanel;
