BEGIN;

CREATE TABLE IF NOT EXISTS vegas.export_list (
  id BIGSERIAL PRIMARY KEY,
  glide_row_id TEXT NOT NULL UNIQUE,
  source_table_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vegas.scheduled_reports (
  id BIGSERIAL PRIMARY KEY,
  glide_row_id TEXT NOT NULL UNIQUE,
  source_table_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vegas.shifts (
  id BIGSERIAL PRIMARY KEY,
  glide_row_id TEXT NOT NULL UNIQUE,
  source_table_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vegas.shift_casinos (
  id BIGSERIAL PRIMARY KEY,
  glide_row_id TEXT NOT NULL UNIQUE,
  source_table_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vegas.shift_restaurants (
  id BIGSERIAL PRIMARY KEY,
  glide_row_id TEXT NOT NULL UNIQUE,
  source_table_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vegas.export_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE vegas.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE vegas.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vegas.shift_casinos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vegas.shift_restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read ON vegas.export_list;
CREATE POLICY authenticated_read ON vegas.export_list FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS authenticated_read ON vegas.scheduled_reports;
CREATE POLICY authenticated_read ON vegas.scheduled_reports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS authenticated_read ON vegas.shifts;
CREATE POLICY authenticated_read ON vegas.shifts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS authenticated_read ON vegas.shift_casinos;
CREATE POLICY authenticated_read ON vegas.shift_casinos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS authenticated_read ON vegas.shift_restaurants;
CREATE POLICY authenticated_read ON vegas.shift_restaurants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS service_role_insert ON vegas.export_list;
CREATE POLICY service_role_insert ON vegas.export_list FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS service_role_insert ON vegas.scheduled_reports;
CREATE POLICY service_role_insert ON vegas.scheduled_reports FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS service_role_insert ON vegas.shifts;
CREATE POLICY service_role_insert ON vegas.shifts FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS service_role_insert ON vegas.shift_casinos;
CREATE POLICY service_role_insert ON vegas.shift_casinos FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS service_role_insert ON vegas.shift_restaurants;
CREATE POLICY service_role_insert ON vegas.shift_restaurants FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS service_role_update ON vegas.export_list;
CREATE POLICY service_role_update ON vegas.export_list FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_update ON vegas.scheduled_reports;
CREATE POLICY service_role_update ON vegas.scheduled_reports FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_update ON vegas.shifts;
CREATE POLICY service_role_update ON vegas.shifts FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_update ON vegas.shift_casinos;
CREATE POLICY service_role_update ON vegas.shift_casinos FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_update ON vegas.shift_restaurants;
CREATE POLICY service_role_update ON vegas.shift_restaurants FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_delete ON vegas.export_list;
CREATE POLICY service_role_delete ON vegas.export_list FOR DELETE TO service_role USING (true);
DROP POLICY IF EXISTS service_role_delete ON vegas.scheduled_reports;
CREATE POLICY service_role_delete ON vegas.scheduled_reports FOR DELETE TO service_role USING (true);
DROP POLICY IF EXISTS service_role_delete ON vegas.shifts;
CREATE POLICY service_role_delete ON vegas.shifts FOR DELETE TO service_role USING (true);
DROP POLICY IF EXISTS service_role_delete ON vegas.shift_casinos;
CREATE POLICY service_role_delete ON vegas.shift_casinos FOR DELETE TO service_role USING (true);
DROP POLICY IF EXISTS service_role_delete ON vegas.shift_restaurants;
CREATE POLICY service_role_delete ON vegas.shift_restaurants FOR DELETE TO service_role USING (true);

GRANT SELECT ON TABLE vegas.export_list TO authenticated;
GRANT SELECT ON TABLE vegas.scheduled_reports TO authenticated;
GRANT SELECT ON TABLE vegas.shifts TO authenticated;
GRANT SELECT ON TABLE vegas.shift_casinos TO authenticated;
GRANT SELECT ON TABLE vegas.shift_restaurants TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE vegas.export_list TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE vegas.scheduled_reports TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE vegas.shifts TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE vegas.shift_casinos TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE vegas.shift_restaurants TO service_role;

GRANT USAGE, SELECT ON SEQUENCE vegas.export_list_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vegas.scheduled_reports_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vegas.shifts_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vegas.shift_casinos_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE vegas.shift_restaurants_id_seq TO service_role;

CREATE INDEX IF NOT EXISTS idx_vegas_export_list_synced_at ON vegas.export_list (synced_at);
CREATE INDEX IF NOT EXISTS idx_vegas_scheduled_reports_synced_at ON vegas.scheduled_reports (synced_at);
CREATE INDEX IF NOT EXISTS idx_vegas_shifts_synced_at ON vegas.shifts (synced_at);
CREATE INDEX IF NOT EXISTS idx_vegas_shift_casinos_synced_at ON vegas.shift_casinos (synced_at);
CREATE INDEX IF NOT EXISTS idx_vegas_shift_restaurants_synced_at ON vegas.shift_restaurants (synced_at);

COMMIT;
