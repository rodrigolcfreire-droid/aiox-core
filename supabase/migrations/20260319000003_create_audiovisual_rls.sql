-- Migration: RLS policies for audiovisual schema
-- Story: AV-1.2
-- Defense-in-depth: RLS enabled on all tables

ALTER TABLE audiovisual.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.media_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.cut ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.output ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiovisual.learning ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by CLI agents)
CREATE POLICY av_project_service ON audiovisual.project FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_media_service ON audiovisual.media_asset FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_cut_service ON audiovisual.cut FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_approval_service ON audiovisual.approval FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_output_service ON audiovisual.output FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_preset_service ON audiovisual.preset FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY av_learning_service ON audiovisual.learning FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read all audiovisual data (dashboard/UI)
CREATE POLICY av_project_read ON audiovisual.project FOR SELECT TO authenticated USING (true);
CREATE POLICY av_media_read ON audiovisual.media_asset FOR SELECT TO authenticated USING (true);
CREATE POLICY av_cut_read ON audiovisual.cut FOR SELECT TO authenticated USING (true);
CREATE POLICY av_approval_read ON audiovisual.approval FOR SELECT TO authenticated USING (true);
CREATE POLICY av_output_read ON audiovisual.output FOR SELECT TO authenticated USING (true);
CREATE POLICY av_preset_read ON audiovisual.preset FOR SELECT TO authenticated USING (true);
CREATE POLICY av_learning_read ON audiovisual.learning FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert approvals (human approval workflow)
CREATE POLICY av_approval_insert ON audiovisual.approval FOR INSERT TO authenticated WITH CHECK (true);

-- Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA audiovisual TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA audiovisual TO authenticated;
GRANT INSERT ON audiovisual.approval TO authenticated;
