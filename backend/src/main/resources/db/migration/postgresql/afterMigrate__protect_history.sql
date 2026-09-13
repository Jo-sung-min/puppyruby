-- Flyway has released its migration/history lock before afterMigrate runs.
-- ALTERing this table inside V2 waits on Flyway's other connection indefinitely.
-- Keep this callback idempotent: Flyway also invokes it when no migrations are pending.
DO $puppyruby_history_access$
DECLARE
    target_schema text := current_schema();
    browser_role text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) THEN
        EXECUTE format('ALTER TABLE %I.flyway_schema_history ENABLE ROW LEVEL SECURITY', target_schema);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.flyway_schema_history FROM PUBLIC', target_schema);
        FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.flyway_schema_history FROM %I', target_schema, browser_role);
        END LOOP;
    END IF;
END
$puppyruby_history_access$;
