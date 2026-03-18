import React, { useState, useEffect } from 'react';
import './IntelligenceDashboard.css';

function IntelligenceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    fetch('/data/intelligence-report.json')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="intel-loading">Carregando dados de inteligencia...</div>;
  if (!data) return <div className="intel-loading">Nenhum dado disponivel. Execute: node bin/intelligence-dashboard.js</div>;

  const { aggregate, agents, platforms } = data;
  const { totals } = aggregate;
  const pct = (n) => totals.messages > 0 ? ((n / totals.messages) * 100).toFixed(1) + '%' : '0%';

  const activeAgent = selectedAgent ? agents.find(a => a.id === selectedAgent) : null;

  return (
    <div className="intelligence-dashboard">
      <div className="intelligence-header">
        <h1>Intelligence Monitor</h1>
        <p className="subtitle">
          {platforms.telegram.agents} bots Telegram + {platforms.whatsapp.groups} grupo(s) WhatsApp
          &nbsp;&middot;&nbsp; Atualizado: {new Date(data.generated_at).toLocaleString('pt-BR')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="intel-stats-grid">
        <div className="intel-stat-card total">
          <div className="stat-label">Total Mensagens</div>
          <div className="stat-value">{totals.messages.toLocaleString()}</div>
        </div>
        <div className="intel-stat-card duvidas">
          <div className="stat-label">Duvidas Reais</div>
          <div className="stat-value">
            {totals.duvidas}
            <span className="stat-pct">{pct(totals.duvidas)}</span>
          </div>
        </div>
        <div className="intel-stat-card dores">
          <div className="stat-label">Dores Reais</div>
          <div className="stat-value">
            {totals.dores}
            <span className="stat-pct">{pct(totals.dores)}</span>
          </div>
        </div>
        <div className="intel-stat-card engajamento">
          <div className="stat-label">Engajamento</div>
          <div className="stat-value">
            {totals.engajamento}
            <span className="stat-pct">{pct(totals.engajamento)}</span>
          </div>
        </div>
      </div>

      {/* Topics Chart */}
      <div className="intel-section">
        <h2>Topicos Mais Discutidos (Cross-Platform)</h2>
        {aggregate.top_topics.length > 0 ? (
          <div className="topics-bar-chart">
            {aggregate.top_topics.map((t, i) => {
              const maxCount = aggregate.top_topics[0].count;
              const width = Math.max((t.count / maxCount) * 100, 5);
              return (
                <div className="topic-bar-row" key={i}>
                  <div className="topic-bar-label">{t.topic}</div>
                  <div className="topic-bar-wrapper">
                    <div className="topic-bar-fill" style={{ width: `${width}%` }}>
                      {t.count}x
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="intel-empty">Nenhum topico identificado</div>
        )}
      </div>

      {/* Two column: Questions + Pains */}
      <div className="intel-two-col">
        <div className="intel-section">
          <h2>Duvidas Recorrentes</h2>
          {aggregate.top_questions.length > 0 ? (
            <ul className="intel-list">
              {aggregate.top_questions.map((q, i) => (
                <li key={i}>
                  <span>{q.text?.slice(0, 80) || 'N/A'}</span>
                  <span className="item-count">{q.count || 1}x &middot; {q.agent}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="intel-empty">Nenhuma duvida operacional detectada</div>
          )}
        </div>

        <div className="intel-section">
          <h2>Dores da Audiencia</h2>
          {aggregate.top_pains.length > 0 ? (
            <ul className="intel-list">
              {aggregate.top_pains.map((p, i) => (
                <li key={i}>
                  <span>{p.text?.slice(0, 80) || 'N/A'}</span>
                  <span className="item-count">{p.count || 1}x &middot; {p.agent}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="intel-empty">Nenhuma dor operacional real detectada</div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {aggregate.suggestions.length > 0 && (
        <div className="intel-section">
          <h2>Sugestoes de Conteudo (Pattern-Based)</h2>
          {aggregate.suggestions.map((s, i) => (
            <div className={`suggestion-card ${s.priority}`} key={i}>
              <div className="suggestion-text">{s.suggestion}</div>
              <div className="suggestion-meta">
                <span className="badge">{s.type}</span>
                <span className="badge">{s.format}</span>
                <span className="badge">{s.priority}</span>
                {s.occurrences && <span>{s.occurrences}x</span>}
                <span>{s.agent} ({s.platform})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Cards */}
      <div className="intel-section">
        <h2>Agentes / Grupos</h2>
        <div className="agents-grid">
          {agents.map(a => (
            <div
              className="agent-intel-card"
              key={a.id}
              onClick={() => setSelectedAgent(selectedAgent === a.id ? null : a.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="agent-header">
                <span className="agent-name">{a.name}</span>
                <span className={`agent-platform ${a.platform}`}>{a.platform}</span>
              </div>
              <div className="agent-stats">
                <div className="agent-mini-stat">
                  <div className="mini-value">{a.total_messages}</div>
                  <div className="mini-label">msgs</div>
                </div>
                <div className="agent-mini-stat">
                  <div className="mini-value" style={{ color: '#38bdf8' }}>{a.classification.duvidas}</div>
                  <div className="mini-label">duvidas</div>
                </div>
                <div className="agent-mini-stat">
                  <div className="mini-value" style={{ color: '#f87171' }}>{a.classification.dores}</div>
                  <div className="mini-label">dores</div>
                </div>
                <div className="agent-mini-stat">
                  <div className="mini-value" style={{ color: '#4ade80' }}>{a.classification.engajamento}</div>
                  <div className="mini-label">engajamento</div>
                </div>
              </div>
              <div className="agent-topics">
                {a.topics.slice(0, 5).map((t, i) => (
                  <span className="topic-tag" key={i}>
                    {t.topic}<span className="count">{t.count}x</span>
                  </span>
                ))}
              </div>

              {/* Hour heatmap (expanded) */}
              {selectedAgent === a.id && a.hour_distribution.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>Atividade por Hora</div>
                  <div className="hour-heatmap">
                    {a.hour_distribution.map((h, idx) => {
                      const max = Math.max(...a.hour_distribution.map(x => x.count || x));
                      const val = h.count ?? h;
                      const height = max > 0 ? Math.max((val / max) * 100, 2) : 2;
                      return (
                        <div
                          key={idx}
                          className={`hour-bar ${val > 0 ? 'active' : ''}`}
                          style={{ height: `${height}%` }}
                          title={`${h.hour ?? idx}h: ${val} msgs`}
                        />
                      );
                    })}
                  </div>
                  <div className="hour-labels">
                    {a.hour_distribution.map((h, idx) => (
                      <span key={idx}>{(h.hour ?? idx)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default IntelligenceDashboard;
