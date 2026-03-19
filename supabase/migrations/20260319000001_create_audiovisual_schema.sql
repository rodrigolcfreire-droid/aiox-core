-- Migration: Create audiovisual schema for Squad Central Audiovisual
-- Source: squads/central-audiovisual/squad.yaml
-- Story: AV-1.2

CREATE SCHEMA IF NOT EXISTS audiovisual;

GRANT USAGE ON SCHEMA audiovisual TO authenticated, anon;
