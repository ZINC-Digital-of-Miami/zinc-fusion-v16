BEGIN;

GRANT SELECT ON TABLE vegas.export_list TO service_role;
GRANT SELECT ON TABLE vegas.scheduled_reports TO service_role;
GRANT SELECT ON TABLE vegas.shifts TO service_role;
GRANT SELECT ON TABLE vegas.shift_casinos TO service_role;
GRANT SELECT ON TABLE vegas.shift_restaurants TO service_role;

DROP POLICY IF EXISTS service_role_read ON vegas.export_list;
CREATE POLICY service_role_read ON vegas.export_list FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_read ON vegas.scheduled_reports;
CREATE POLICY service_role_read ON vegas.scheduled_reports FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_read ON vegas.shifts;
CREATE POLICY service_role_read ON vegas.shifts FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_read ON vegas.shift_casinos;
CREATE POLICY service_role_read ON vegas.shift_casinos FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_read ON vegas.shift_restaurants;
CREATE POLICY service_role_read ON vegas.shift_restaurants FOR SELECT TO service_role USING (true);

COMMIT;
