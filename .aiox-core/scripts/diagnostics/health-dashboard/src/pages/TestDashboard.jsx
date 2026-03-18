import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendChart } from '../components';
import { useHealthData, useAutoRefresh } from '../hooks';
import './TestDashboard.css';

/* ── Score helpers ── */
function getStatus(score) {
  if (score >= 90) return { status: 'healthy', color: '#22c55e', label: 'Saudavel' };
  if (score >= 70) return { status: 'degraded', color: '#eab308', label: 'Degradado' };
  if (score >= 50) return { status: 'warning', color: '#f97316', label: 'Alerta' };
  return { status: 'critical', color: '#ef4444', label: 'Critico' };
}

function getBadgeClass(severity) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'cc-badge-critical';
  if (s === 'high') return 'cc-badge-high';
  if (s === 'medium') return 'cc-badge-medium';
  if (s === 'low') return 'cc-badge-low';
  return 'cc-badge-info';
}

/* ── Score Ring ── */
function ScoreRing({ score, size = 160 }) {
  const { color } = getStatus(score);
  const sw = 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = ((100 - score) / 100) * c;
  const mid = size / 2;

  return (
    <div className="cc-score-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ccGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="#00e5cc" />
          </linearGradient>
        </defs>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="url(#ccGrad)" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${mid} ${mid})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="cc-score-ring__inner">
        <span className="cc-score-ring__number">{score}</span>
        <span className="cc-score-ring__label">Health</span>
      </div>
    </div>
  );
}

/* ── Pipeline (exato da referencia) ── */
function Pipeline({ score }) {
  const stages = score >= 90
    ? [['done', '\u2713'], ['done', '\u2713'], ['done', '\u2713'], ['active', score]]
    : score >= 70
    ? [['done', '\u2713'], ['done', '\u2713'], ['warning', '!'], ['active', score]]
    : score >= 50
    ? [['done', '\u2713'], ['warning', '!'], ['warning', '!'], ['critical', score]]
    : [['critical', '!'], ['critical', '!'], ['critical', '!'], ['critical', score]];

  const labels = ['Init', 'Config', 'Health', 'Live'];

  return (
    <div className="cc-pipeline">
      {stages.map(([cls, val], i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="cc-pip-arrow">&#9654;</span>}
          <div className="cc-pip-stage">
            <div className={`cc-pip-dot ${cls}`}>{val}</div>
            <span className="cc-pip-label">{labels[i]}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

const DOMAIN_LABELS = {
  project: 'Project Coherence',
  local: 'Local Environment',
  repository: 'Repository Health',
  deployment: 'Deployment',
  services: 'Service Integration'
};

const TIER_LABELS = { 1: 'Auto-Fix', 2: 'Review & Fix', 3: 'Manual Guide' };

/* ══════════════════════════════════════════
   Test Dashboard — Centro de Comando Visual
   ══════════════════════════════════════════ */
function TestDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, lastUpdated, refresh } = useHealthData();
  const autoRefresh = useAutoRefresh({ interval: 30000, onRefresh: refresh });
  const [issueFilter, setIssueFilter] = useState('all');

  if (loading && !data) {
    return (
      <div className="test-dashboard">
        <div className="cc-loading"><div className="cc-spinner" /><p>Inicializando Sistema...</p></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="test-dashboard">
        <div className="cc-error">
          <h2>Erro no Sistema</h2>
          <p style={{ color: 'var(--cc-muted)' }}>{error.message}</p>
          <button className="cc-btn-update" onClick={refresh}>Reconectar</button>
        </div>
      </div>
    );
  }

  const { overall, domains, issues, autoFixed, techDebt, history } = data || {};

  /* Flatten issues */
  const allIssues = [];
  if (issues) {
    ['critical', 'high', 'medium', 'low'].forEach(sev => {
      if (issues[sev]) {
        issues[sev].forEach(issue => allIssues.push({ ...issue, severity: sev }));
      }
    });
  }
  const filteredIssues = issueFilter === 'all'
    ? allIssues
    : allIssues.filter(i => i.severity === issueFilter);

  return (
    <div className="test-dashboard">

      {/* ── Health Header ── */}
      <div className="cc-health-header">
        <div className="cc-health-left">
          <h2>Saude do Sistema</h2>
          {lastUpdated && (
            <span className="cc-last-update">
              Ultima atualizacao: {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button className="cc-btn-update" onClick={refresh} disabled={autoRefresh.isRefreshing}>
            {autoRefresh.isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        <div className="cc-health-right">
          <label className="cc-auto-update">
            <input type="checkbox" checked={autoRefresh.isEnabled} onChange={autoRefresh.toggle} />
            Atualizacao Automatica
          </label>
          {autoRefresh.isEnabled && (
            <span className="cc-next-badge">A seguir: {autoRefresh.countdown}s</span>
          )}
        </div>
      </div>
      <p className="cc-health-desc">Estado geral do sistema e dos dominios monitorados.</p>

      {/* ── Score + Metrics Hero ── */}
      <div className="cc-hero-grid">
        <div className="cc-squad-card">
          <h3>Score Geral</h3>
          <p className="cc-squad-desc">Indicador de saude consolidado do sistema</p>
          <div className="cc-score-center">
            <ScoreRing score={overall?.score || 0} />
            <div>
              <Pipeline score={overall?.score || 0} />
            </div>
          </div>
          <div className="cc-metrics">
            <div className="cc-metric-box">
              <span className="cc-metric-val cyan">{overall?.score || 0}</span>
              <span className="cc-metric-label">Score</span>
            </div>
            <div className="cc-metric-box">
              <span className="cc-metric-val red">{overall?.issuesCount || 0}</span>
              <span className="cc-metric-label">Problemas</span>
            </div>
            <div className="cc-metric-box">
              <span className="cc-metric-val green">{overall?.autoFixedCount || 0}</span>
              <span className="cc-metric-label">Auto-Fixed</span>
            </div>
            {history?.scoreDelta !== undefined && (
              <div className="cc-metric-box">
                <span className={`cc-metric-val ${history.scoreDelta >= 0 ? 'green' : 'red'}`}>
                  {history.scoreDelta >= 0 ? '+' : ''}{history.scoreDelta}
                </span>
                <span className="cc-metric-label">vs Anterior</span>
              </div>
            )}
          </div>
        </div>

        <div className="cc-squad-card">
          <h3>Dominios</h3>
          <p className="cc-squad-desc">Resumo de status por dominio</p>
          <div className="cc-agent-list">
            {domains && Object.entries(domains).map(([id, d]) => {
              const { status } = getStatus(d?.score || 0);
              const badgeClass = status === 'healthy' ? 'cc-badge-ativo' :
                status === 'degraded' ? 'cc-badge-medium' :
                status === 'warning' ? 'cc-badge-high' : 'cc-badge-critical';
              return (
                <div key={id} className="cc-agent-row" style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/domain/${id}`)}>
                  <div>
                    <span className="cc-agent-name">{DOMAIN_LABELS[id] || id}</span>
                    <span className="cc-agent-role">{d?.score || 0}/100</span>
                  </div>
                  <span className={`cc-badge ${badgeClass}`}>{status}</span>
                </div>
              );
            })}
          </div>
          <div className="cc-metrics">
            <div className="cc-metric-box">
              <span className="cc-metric-val green">
                {domains ? Object.values(domains).filter(d => (d?.score || 0) >= 90).length : 0}/
                {domains ? Object.keys(domains).length : 0}
              </span>
              <span className="cc-metric-label">Saudaveis</span>
            </div>
            <div className="cc-metric-box">
              <span className="cc-metric-val cyan">{domains ? Object.keys(domains).length : 0}</span>
              <span className="cc-metric-label">Dominios</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trend ── */}
      <div className="cc-trend-panel">
        <h3>Tendencia de Saude</h3>
        <TrendChart data={history?.trend || []} height={200} />
      </div>

      {/* ── Domain Detail Cards ── */}
      <h2 className="cc-section-title">Saude por Dominio</h2>
      <div className="cc-domain-grid">
        {domains && Object.entries(domains).map(([domainId, domainData]) => {
          const score = domainData?.score || 0;
          const passedChecks = domainData?.checks?.filter(c => c.status === 'passed').length || 0;
          const totalChecks = domainData?.checks?.length || 0;
          const domainIssues = [];
          if (domainData?.checks) {
            domainData.checks.forEach(check => {
              if (check.status === 'failed') domainIssues.push(check);
            });
          }

          return (
            <div key={domainId} className="cc-squad-card cc-domain-card"
              onClick={() => navigate(`/domain/${domainId}`)}>
              <h3>{DOMAIN_LABELS[domainId] || domainId}</h3>
              <p className="cc-squad-desc">{passedChecks}/{totalChecks} checks passed &middot; Score: {score}/100</p>
              <Pipeline score={score} />
              {domainIssues.length > 0 && (
                <div className="cc-agent-list">
                  {domainIssues.slice(0, 4).map((issue, i) => (
                    <div key={i} className="cc-agent-row">
                      <div>
                        <span className="cc-agent-name">{issue.name || issue.message || 'Issue'}</span>
                        <span className="cc-agent-role">{issue.checkId || ''}</span>
                      </div>
                      <span className={`cc-badge ${getBadgeClass(issue.severity)}`}>
                        {(issue.severity || 'low').toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="cc-metrics">
                <div className="cc-metric-box">
                  <span className={`cc-metric-val ${score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red'}`}>{score}</span>
                  <span className="cc-metric-label">Score</span>
                </div>
                <div className="cc-metric-box">
                  <span className="cc-metric-val cyan">{domainIssues.length}</span>
                  <span className="cc-metric-label">Issues</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Issues + Side Panels ── */}
      <h2 className="cc-section-title">Problemas &amp; Acoes</h2>
      <div className="cc-panels-grid">

        {/* Issues */}
        <div className="cc-panel">
          <h3>Issues Ativas <span className="cc-panel-count">{allIssues.length}</span></h3>
          <div className="cc-filters">
            {['all', 'critical', 'high', 'medium', 'low'].map(f => (
              <button key={f}
                className={`cc-filter-btn ${issueFilter === f ? 'active' : ''}`}
                onClick={() => setIssueFilter(f)}>
                {f === 'all' ? 'Todos' : f}
              </button>
            ))}
          </div>
          {filteredIssues.length === 0 ? (
            <div className="cc-empty">Nenhuma issue encontrada</div>
          ) : (
            <div className="cc-agent-list">
              {filteredIssues.slice(0, 6).map((issue, i) => (
                <div key={issue.checkId || i} className="cc-agent-row">
                  <div>
                    <span className="cc-agent-name">{issue.name || issue.message || 'Issue'}</span>
                    <span className="cc-agent-role">
                      {issue.checkId || ''}{issue.domain ? ` \u00B7 ${issue.domain}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {issue.autoFix && (
                      <span className="cc-badge cc-badge-info">{TIER_LABELS[issue.autoFix.tier]}</span>
                    )}
                    <span className={`cc-badge ${getBadgeClass(issue.severity)}`}>
                      {issue.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredIssues.length > 6 && (
            <div className="cc-empty" style={{ paddingTop: '8px' }}>
              + {filteredIssues.length - 6} mais issues
            </div>
          )}
        </div>

        {/* Side Stack */}
        <div className="cc-side-stack">
          {/* Auto-Fix */}
          <div className="cc-panel">
            <h3>Correcoes Automaticas {(autoFixed || []).length > 0 && <span className="cc-panel-count">{autoFixed.length}</span>}</h3>
            {(autoFixed || []).length === 0 ? (
              <div className="cc-empty">Nenhuma correcao automatica</div>
            ) : (
              (autoFixed || []).slice(0, 4).map((fix, i) => (
                <div key={fix.checkId || i} className="cc-fix-row">
                  <div className="cc-fix-icon">{'\u2713'}</div>
                  <span className="cc-fix-text">{fix.action || fix.message || 'Fixed'}</span>
                  <span className="cc-fix-time">{fix.checkId || ''}</span>
                </div>
              ))
            )}
          </div>

          {/* Tech Debt */}
          <div className="cc-panel">
            <h3>Debito Tecnico {(techDebt || []).length > 0 && <span className="cc-panel-count">{techDebt.length}</span>}</h3>
            {(techDebt || []).length === 0 ? (
              <div className="cc-empty">Nenhum debito tecnico</div>
            ) : (
              <div className="cc-agent-list">
                {(techDebt || []).slice(0, 4).map((item, i) => (
                  <div key={item.id || i} className="cc-agent-row">
                    <div>
                      <span className="cc-agent-name">{item.title || 'Debt'}</span>
                      <span className="cc-agent-role">
                        {item.domain || ''}{item.effort ? ` \u00B7 ${item.effort}` : ''}
                      </span>
                    </div>
                    <span className={`cc-badge ${getBadgeClass(item.priority)}`}>
                      {item.priority || 'LOW'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="cc-footer">
        <p>
          AIOX Centro de Comando v{data?.version || '1.0.0'} |
          Mode: {data?.mode || 'full'} |
          Duration: {data?.duration || 'N/A'}
        </p>
      </footer>
    </div>
  );
}

export default TestDashboard;
