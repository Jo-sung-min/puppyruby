-- PuppyRuby authenticates through its Java API, not through Supabase's Data API.
-- Supabase may grant browser roles access to SQL-created tables in public.
-- Keep those roles away from account, session, payment, and game records.
-- The JDBC table owner (and explicitly privileged server roles) keeps access.
-- Other schemas and tables are deliberately outside this migration's scope.
-- Flyway holds its history-table lock on another connection while V2 runs.
-- Protect that table only after migrate returns, in the afterMigrate callback.
DO $puppyruby_browser_access$
DECLARE
    target_schema text := current_schema();
    target_table text;
    browser_role text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) THEN
        FOREACH target_table IN ARRAY ARRAY[
            'accounts', 'admin_audit', 'appearance_breed_styles', 'appearance_breed_varieties',
            'appearance_deleted_styles', 'appearance_settings', 'appearance_varieties',
            'auth_email_tokens', 'auth_mutex', 'auth_sessions', 'commerce_draws',
            'commerce_items', 'commerce_settings', 'commerce_ticket_ledger', 'commerce_wallets',
            'desktop_devices', 'desktop_mutex', 'desktop_pairings', 'desktop_receipts',
            'media_uploads', 'payment_orders', 'players', 'puppies', 'seo_pages', 'seo_settings',
            'walk_friendships', 'walk_messages', 'walk_mutex', 'walk_profiles', 'walk_rooms'
        ] LOOP
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target_schema, target_table);
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', target_schema, target_table);
            FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
                EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', target_schema, target_table, browser_role);
            END LOOP;
        END LOOP;
    END IF;
END
$puppyruby_browser_access$;
