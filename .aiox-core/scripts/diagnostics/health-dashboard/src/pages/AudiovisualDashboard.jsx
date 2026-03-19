import React, { useState, useEffect } from 'react';
import './AudiovisualDashboard.css';

function AudiovisualDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    fetch('/data/audiovisual-data.json')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="av-loading">Carregando Central Audiovisual...</div>;
  if (!data) return (
    <div className="av-loading">
      Nenhum dado disponivel.<br />
      Execute: <code>node bin/av-dashboard-data.js</code>
    </div>
  );

  const { summary, projects } = data;
  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'cuts', label: 'Cortes Inteligentes' },
    { id: 'scale', label: 'Escala de Criativos' },
    { id: 'library', label: 'Biblioteca de Blocos' },
    { id: 'playbooks', label: 'Playbooks' },
    { id: 'output', label: 'Output' },
    { id: 'reports', label: 'Relatorios' },
  ];

  return (
    <div className="av-dashboard">
      <div className="av-header">
        <h1>Central Audiovisual</h1>
        <p className="av-subtitle">
          {summary.totalProjects} projeto(s) &middot; {summary.totalCuts} cortes &middot; {summary.totalOutputs} outputs
          &nbsp;&middot;&nbsp; {new Date(data.generated_at).toLocaleString('pt-BR')}
        </p>
      </div>

      {/* Tabs */}
      <div className="av-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`av-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="av-tab-content">
          <div className="av-stats-grid">
            <StatCard label="Projetos" value={summary.totalProjects} color="#38bdf8" />
            <StatCard label="Em Processamento" value={summary.activeProjects} color="#fbbf24" />
            <StatCard label="Cortes Sugeridos" value={summary.totalCuts} color="#a78bfa" />
            <StatCard label="Videos Finalizados" value={summary.totalOutputs} color="#34d399" />
          </div>

          <div className="av-section">
            <h2>Status dos Projetos</h2>
            <div className="av-status-bar">
              {Object.entries(summary.statusCounts).map(([status, count]) => count > 0 && (
                <div key={status} className={`av-status-segment status-${status}`} style={{ flex: count }}>
                  {status} ({count})
                </div>
              ))}
            </div>
          </div>

          <div className="av-section">
            <h2>Projetos</h2>
            <div className="av-projects-grid">
              {projects.map(p => (
                <div
                  key={p.id}
                  className={`av-project-card ${selectedProject === p.id ? 'selected' : ''}`}
                  onClick={() => setSelectedProject(selectedProject === p.id ? null : p.id)}
                >
                  <div className="project-name">{p.name}</div>
                  <div className="project-meta">
                    <span className={`project-status status-${p.status}`}>{p.status}</span>
                    <span className="project-date">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {p.metadata && (
                    <div className="project-info">
                      {p.metadata.duration} &middot; {p.metadata.resolution}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {activeProject && <ProjectDetail project={activeProject} />}
        </div>
      )}

      {/* Cortes Tab */}
      {activeTab === 'cuts' && (
        <div className="av-tab-content">
          <h2>Cortes Inteligentes</h2>
          {projects.map(p => p.cuts && (
            <div key={p.id} className="av-section">
              <h3>{p.name}</h3>
              <div className="av-cuts-grid">
                {p.cuts.suggestedCuts.map(cut => (
                  <div key={cut.id} className={`av-cut-card status-${cut.status}`}>
                    <div className="cut-header">
                      <span className="cut-id">{cut.id}</span>
                      <span className={`cut-category cat-${cut.category}`}>{cut.category}</span>
                    </div>
                    <div className="cut-meta">
                      <span>{cut.duration?.toFixed(0)}s</span>
                      <span>{cut.format}</span>
                      <span className="cut-score">Score: {cut.engagementScore}</span>
                    </div>
                    <div className="cut-platforms">
                      {(cut.platform || []).map(pl => (
                        <span key={pl} className="platform-tag">{pl}</span>
                      ))}
                    </div>
                    <div className={`cut-status status-${cut.status}`}>{cut.status}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {projects.every(p => !p.cuts) && <div className="av-empty">Nenhum corte gerado ainda.</div>}
        </div>
      )}

      {/* Scale Tab */}
      {activeTab === 'scale' && (
        <div className="av-tab-content">
          <h2>Escala de Criativos</h2>
          <div className="av-empty">
            Gere variacoes com: <code>node bin/av-scale.js &lt;project-id&gt;</code>
          </div>
        </div>
      )}

      {/* Library Tab */}
      {activeTab === 'library' && (
        <div className="av-tab-content">
          <h2>Biblioteca de Blocos</h2>
          {projects.map(p => p.segments && (
            <div key={p.id} className="av-section">
              <h3>{p.name} — {p.segments.totalBlocks} blocos</h3>
              <div className="av-blocks-grid">
                {p.segments.blocks.map(block => (
                  <div key={block.id} className={`av-block-card type-${block.type}`}>
                    <div className="block-type">{block.type}</div>
                    <div className="block-title">{block.title}</div>
                    <div className="block-meta">
                      {block.duration.toFixed(1)}s &middot; {block.energyLevel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {projects.every(p => !p.segments) && <div className="av-empty">Nenhum bloco segmentado ainda.</div>}
        </div>
      )}

      {/* Playbooks Tab */}
      {activeTab === 'playbooks' && (
        <div className="av-tab-content">
          <h2>Playbooks</h2>
          {projects.map(p => p.learnings && p.learnings.patterns.length > 0 && (
            <div key={p.id} className="av-section">
              <h3>{p.name}</h3>
              <div className="av-patterns-grid">
                {p.learnings.patterns.map((pattern, i) => (
                  <div key={i} className="av-pattern-card">
                    <div className="pattern-type">{pattern.type.replace(/_/g, ' ')}</div>
                    {pattern.category && <div className="pattern-detail">Categoria: {pattern.category} ({(pattern.approvalRate * 100).toFixed(0)}%)</div>}
                    {pattern.avgApprovedDuration && <div className="pattern-detail">Duracao media: {pattern.avgApprovedDuration}s</div>}
                    {pattern.platform && <div className="pattern-detail">Plataforma: {pattern.platform}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {projects.every(p => !p.learnings || p.learnings.patterns.length === 0) && (
            <div className="av-empty">Nenhum aprendizado ainda. Aprove cortes e execute: <code>node bin/av-approve.js &lt;id&gt; learn</code></div>
          )}
        </div>
      )}

      {/* Output Tab */}
      {activeTab === 'output' && (
        <div className="av-tab-content">
          <h2>Output</h2>
          {projects.map(p => p.outputs && p.outputs.length > 0 && (
            <div key={p.id} className="av-section">
              <h3>{p.name}</h3>
              <div className="av-outputs-list">
                {p.outputs.map(o => (
                  <div key={o.filename} className="av-output-row">
                    <span className="output-name">{o.filename}</span>
                    <span className="output-size">{o.sizeMB} MB</span>
                    <span className="output-date">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {projects.every(p => !p.outputs || p.outputs.length === 0) && (
            <div className="av-empty">Nenhum video finalizado. Execute: <code>node bin/av-produce.js &lt;project-id&gt;</code></div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="av-tab-content">
          <h2>Relatorios</h2>
          {projects.map(p => (
            <div key={p.id} className="av-section">
              <h3>{p.name}</h3>
              <div className="av-report-summary">
                <div>Status: <strong>{p.status}</strong></div>
                <div>Cortes: <strong>{p.cuts ? p.cuts.suggestedCuts.length : 0}</strong></div>
                <div>Outputs: <strong>{p.outputs ? p.outputs.length : 0}</strong></div>
                {p.description && <div>Keywords: <strong>{p.description.keywords.map(k => k.word).slice(0, 5).join(', ')}</strong></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project }) {
  return (
    <div className="av-project-detail">
      <h3>Detalhes: {project.name}</h3>
      <div className="detail-grid">
        <div className="detail-item"><span>ID:</span> <code>{project.id}</code></div>
        <div className="detail-item"><span>Status:</span> {project.status}</div>
        <div className="detail-item"><span>Fonte:</span> {project.sourceType}</div>
        {project.metadata && (
          <>
            <div className="detail-item"><span>Duracao:</span> {project.metadata.duration}</div>
            <div className="detail-item"><span>Resolucao:</span> {project.metadata.resolution}</div>
            <div className="detail-item"><span>Codec:</span> {project.metadata.codec}</div>
          </>
        )}
        {project.cuts && <div className="detail-item"><span>Cortes:</span> {project.cuts.suggestedCuts.length}</div>}
        {project.outputs && <div className="detail-item"><span>Outputs:</span> {project.outputs.length}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="av-stat-card" style={{ borderColor: color }}>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default AudiovisualDashboard;
