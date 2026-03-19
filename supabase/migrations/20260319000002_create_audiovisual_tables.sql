-- Migration: Create audiovisual schema tables (7 tables)
-- Source: squads/central-audiovisual/squad.yaml
-- Story: AV-1.2
-- Purpose: Pipeline de producao audiovisual automatizada

-- Projetos de producao
CREATE TABLE audiovisual.project (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    source_url      TEXT,
    source_type     TEXT NOT NULL DEFAULT 'upload',
    status          TEXT NOT NULL DEFAULT 'created',
    duration_seconds NUMERIC,
    resolution      TEXT,
    metadata_json   JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_project_source_type CHECK (source_type IN ('upload', 'drive', 'url')),
    CONSTRAINT chk_project_status CHECK (status IN ('created', 'ingesting', 'analyzing', 'analyzed', 'producing', 'rendered', 'published', 'done', 'error'))
);

-- Videos originais e processados
CREATE TABLE audiovisual.media_asset (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES audiovisual.project(id) ON DELETE CASCADE,
    type            TEXT NOT NULL DEFAULT 'source',
    file_path       TEXT NOT NULL,
    duration_seconds NUMERIC,
    resolution      TEXT,
    codec           TEXT,
    fps             NUMERIC,
    bitrate_kbps    INT,
    file_size_bytes BIGINT,
    metadata_json   JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_asset_type CHECK (type IN ('source', 'assembled', 'subtitled', 'branded', 'final'))
);

-- Cortes identificados e aprovados
CREATE TABLE audiovisual.cut (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES audiovisual.project(id) ON DELETE CASCADE,
    category        TEXT NOT NULL DEFAULT 'viral',
    objective       TEXT,
    start_time      NUMERIC NOT NULL,
    end_time        NUMERIC NOT NULL,
    duration_seconds NUMERIC GENERATED ALWAYS AS (end_time - start_time) STORED,
    blocks          JSONB DEFAULT '[]',
    engagement_score NUMERIC(4,2) DEFAULT 0.00,
    format          TEXT NOT NULL DEFAULT '9:16',
    platform        JSONB DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'suggested',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_cut_category CHECK (category IN ('viral', 'autoridade', 'educativo', 'storytelling', 'cta', 'bastidores', 'tendencia')),
    CONSTRAINT chk_cut_format CHECK (format IN ('9:16', '16:9', '1:1', '4:5')),
    CONSTRAINT chk_cut_status CHECK (status IN ('suggested', 'approved', 'rejected', 'edited')),
    CONSTRAINT chk_cut_times CHECK (end_time > start_time)
);

-- Decisoes de aprovacao
CREATE TABLE audiovisual.approval (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cut_id          UUID NOT NULL REFERENCES audiovisual.cut(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES audiovisual.project(id) ON DELETE CASCADE,
    decision        TEXT NOT NULL,
    feedback        TEXT,
    decided_by      TEXT NOT NULL DEFAULT 'human',
    decided_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_approval_decision CHECK (decision IN ('approved', 'rejected', 'edited'))
);

-- Videos finalizados
CREATE TABLE audiovisual.output (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES audiovisual.project(id) ON DELETE CASCADE,
    cut_id          UUID REFERENCES audiovisual.cut(id) ON DELETE SET NULL,
    media_asset_id  UUID REFERENCES audiovisual.media_asset(id) ON DELETE SET NULL,
    title           TEXT,
    description     TEXT,
    tags            JSONB DEFAULT '[]',
    drive_url       TEXT,
    download_url    TEXT,
    status          TEXT NOT NULL DEFAULT 'rendering',
    quality_score   NUMERIC(4,2),
    render_started_at TIMESTAMPTZ,
    render_finished_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_output_status CHECK (status IN ('queued', 'rendering', 'rendered', 'published', 'error'))
);

-- Configuracoes reutilizaveis (branding, legenda, formato)
CREATE TABLE audiovisual.preset (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_preset_type CHECK (type IN ('branding', 'legenda', 'format', 'quality')),
    UNIQUE(name, type)
);

-- Padroes aprendidos das decisoes do usuario
CREATE TABLE audiovisual.learning (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES audiovisual.project(id) ON DELETE SET NULL,
    pattern_type    TEXT NOT NULL,
    pattern_data    JSONB NOT NULL DEFAULT '{}',
    confidence      NUMERIC(3,2) DEFAULT 0.50,
    applied_count   INT DEFAULT 0,
    last_applied_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_learning_type CHECK (pattern_type IN ('cut_preference', 'duration_preference', 'category_preference', 'style_preference', 'platform_preference', 'engagement_correlation'))
);

-- Indexes para queries frequentes
CREATE INDEX idx_av_media_project ON audiovisual.media_asset(project_id);
CREATE INDEX idx_av_media_type ON audiovisual.media_asset(type);
CREATE INDEX idx_av_cut_project ON audiovisual.cut(project_id);
CREATE INDEX idx_av_cut_status ON audiovisual.cut(status);
CREATE INDEX idx_av_cut_category ON audiovisual.cut(category);
CREATE INDEX idx_av_approval_project ON audiovisual.approval(project_id);
CREATE INDEX idx_av_approval_cut ON audiovisual.approval(cut_id);
CREATE INDEX idx_av_output_project ON audiovisual.output(project_id);
CREATE INDEX idx_av_output_status ON audiovisual.output(status);
CREATE INDEX idx_av_preset_type ON audiovisual.preset(type);
CREATE INDEX idx_av_learning_type ON audiovisual.learning(pattern_type);
CREATE INDEX idx_av_learning_project ON audiovisual.learning(project_id);
CREATE INDEX idx_av_project_status ON audiovisual.project(status);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION audiovisual.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_updated_at BEFORE UPDATE ON audiovisual.project FOR EACH ROW EXECUTE FUNCTION audiovisual.update_updated_at();
CREATE TRIGGER trg_cut_updated_at BEFORE UPDATE ON audiovisual.cut FOR EACH ROW EXECUTE FUNCTION audiovisual.update_updated_at();
CREATE TRIGGER trg_preset_updated_at BEFORE UPDATE ON audiovisual.preset FOR EACH ROW EXECUTE FUNCTION audiovisual.update_updated_at();
CREATE TRIGGER trg_learning_updated_at BEFORE UPDATE ON audiovisual.learning FOR EACH ROW EXECUTE FUNCTION audiovisual.update_updated_at();
