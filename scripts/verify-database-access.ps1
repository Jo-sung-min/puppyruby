# Tests SQL permissions in a rolled-back transaction, then real Flyway connection/lock behavior.
param(
    [string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    [string]$Java = '',
    [string]$Gradle = '',
    [string]$RuntimeClasspathFile = ''
)
$ErrorActionPreference = 'Stop'
if ($env:PUPPY_TEST_ISOLATED -ne '1') { throw 'Set PUPPY_TEST_ISOLATED=1 to run the isolated database-access check.' }
if (-not (Test-Path -LiteralPath $Psql -PathType Leaf)) { throw 'The PostgreSQL 16 psql executable is required.' }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationDirectory = Join-Path $workspace 'backend/src/main/resources/db/migration/postgresql'
$outputDirectory = Join-Path $workspace 'backend/build/access-check'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$targetSchema = 'puppyruby_access_' + $suffix
$otherSchema = 'puppyruby_access_other_' + $suffix
$ownerRole = 'puppyruby_access_owner_' + $suffix

function Invoke-IsolatedSql([string]$Sql) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Psql
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($name in @('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE')) {
        $null = $start.Environment.Remove($name)
    }
    $start.Environment['PGSSLMODE'] = 'disable'
    $start.Environment['PGCONNECT_TIMEOUT'] = '5'
    $start.Environment['PGOPTIONS'] = '-c statement_timeout=30000 -c lock_timeout=5000'
    $start.Environment['PGAPPNAME'] = 'puppyruby-access-isolated-check'
    $start.Environment['PGPASSFILE'] = Join-Path $outputDirectory 'unused-pgpass'
    foreach ($argument in @('-X','-w','-h','127.0.0.1','-p','15439','-U','flyway_check','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-f','-')) {
        $start.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::Start($start)
    $process.StandardInput.Write($Sql)
    $process.StandardInput.Close()
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $output = $outputTask.GetAwaiter().GetResult()
    $errorText = $errorTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
    $process.Dispose()
    if ($exitCode -ne 0) {
        [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
        [IO.File]::WriteAllText((Join-Path $outputDirectory 'fixture-error.log'), $output + $errorText)
        throw 'Isolated access check failed; the connection closed and its transaction rolled back. Inspect backend/build/access-check/fixture-error.log.'
    }
    return $output.Trim()
}

$identity = Invoke-IsolatedSql "SELECT host(inet_server_addr()) || '|' || inet_server_port() || '|' || current_database() || '|' || current_user;"
if ($identity -ne '127.0.0.1|15439|postgres|flyway_check') { throw 'Refusing to run outside the explicitly isolated local PostgreSQL fixture.' }
$browserRolesBefore = Invoke-IsolatedSql "SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated');"
$v1 = [IO.File]::ReadAllText((Join-Path $migrationDirectory 'V1__initial_schema.sql'))
$v2 = [IO.File]::ReadAllText((Join-Path $migrationDirectory 'V2__restrict_browser_database_access.sql'))
$historyCallback = [IO.File]::ReadAllText((Join-Path $migrationDirectory 'afterMigrate__protect_history.sql'))

$begin = @'
BEGIN;
DO $guard$
BEGIN
    IF host(inet_server_addr()) <> '127.0.0.1' OR inet_server_port() <> 15439 OR current_database() <> 'postgres' OR current_user <> 'flyway_check' THEN
        RAISE EXCEPTION 'Fixture identity mismatch';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('__TARGET__','__OTHER__')) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='__OWNER__') THEN
        RAISE EXCEPTION 'Refusing to overwrite existing test schemas or owner role';
    END IF;
END
$guard$;
CREATE ROLE "__OWNER__" NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA "__TARGET__" AUTHORIZATION "__OWNER__";
CREATE SCHEMA "__OTHER__" AUTHORIZATION "__OWNER__";
SET LOCAL ROLE "__OWNER__";
SET LOCAL search_path TO "__TARGET__";
'@

$fixture = @'
CREATE TABLE flyway_schema_history (installed_rank integer PRIMARY KEY);
CREATE TABLE unrelated_sentinel (id integer PRIMARY KEY);
CREATE TABLE "__OTHER__".accounts (id integer PRIMARY KEY);
INSERT INTO unrelated_sentinel VALUES (1);
INSERT INTO "__OTHER__".accounts VALUES (1);
INSERT INTO auth_mutex (id) VALUES ('access-fixture');
DO $fixture$
BEGIN
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relname<>'unrelated_sentinel') <> 31 THEN
        RAISE EXCEPTION 'Expected 30 V1 app tables plus one history table';
    END IF;
END
$fixture$;
'@

$noRoleCheck = @'
DO $generic_noop$
BEGIN
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relrowsecurity) <> 0 THEN
        RAISE EXCEPTION 'Generic PostgreSQL without browser roles must leave RLS unchanged';
    END IF;
END
$generic_noop$;
'@

$grants = @'
RESET ROLE;
DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Fixture browser roles must not bypass RLS';
    END IF;
END
$roles$;
GRANT USAGE ON SCHEMA "__TARGET__", "__OTHER__" TO PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "__TARGET__", "__OTHER__" TO PUBLIC, anon, authenticated;
CREATE TEMP TABLE sentinel_access_before AS
SELECT c.oid, c.relacl::text AS acl, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='__TARGET__' AND c.relname='unrelated_sentinel') OR (n.nspname='__OTHER__' AND c.relname='accounts');
SET LOCAL ROLE "__OWNER__";
SET LOCAL search_path TO "__TARGET__";
'@

$ownerChecks = @'
DO $owner_access$
DECLARE target_table text; observed bigint; checked integer := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Owner access check must use a non-superuser without BYPASSRLS';
    END IF;
    FOR target_table IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relname<>'unrelated_sentinel' LOOP
        EXECUTE format('SELECT count(*) FROM %I.%I', '__TARGET__', target_table) INTO observed;
        checked := checked + 1;
    END LOOP;
    IF checked <> 31 OR (SELECT count(*) FROM auth_mutex WHERE id='access-fixture') <> 1 THEN
        RAISE EXCEPTION 'JDBC table owner lost application access or existing data';
    END IF;
END
$owner_access$;
RESET ROLE;
DO $access_metadata$
DECLARE protected integer; forbidden integer;
BEGIN
    SELECT count(*) INTO protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relname<>'unrelated_sentinel' AND c.relrowsecurity;
    IF protected <> 31 THEN RAISE EXCEPTION 'Every app/history table must have RLS enabled'; END IF;
    SELECT count(*) INTO forbidden FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) acl
    WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relname<>'unrelated_sentinel'
      AND (acl.grantee=0 OR acl.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')));
    IF forbidden <> 0 THEN RAISE EXCEPTION 'PUBLIC or browser-role table grants remain'; END IF;
    IF EXISTS (SELECT 1 FROM sentinel_access_before before JOIN pg_class c ON c.oid=before.oid WHERE c.relacl::text IS DISTINCT FROM before.acl OR c.relrowsecurity IS DISTINCT FROM before.relrowsecurity) THEN
        RAISE EXCEPTION 'Migration changed an unrelated table or another schema';
    END IF;
END
$access_metadata$;
'@

$browserChecks = @'
SET LOCAL ROLE "__BROWSER__";
DO $browser_denials$
DECLARE target_table text; first_column text; operation text; denied integer := 0; observed bigint;
BEGIN
    FOR target_table IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='__TARGET__' AND c.relkind='r' AND c.relname<>'unrelated_sentinel' LOOP
        SELECT a.attname INTO first_column FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='__TARGET__' AND c.relname=target_table AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1;
        FOREACH operation IN ARRAY ARRAY[
            format('SELECT count(*) FROM %I.%I','__TARGET__',target_table),
            format('INSERT INTO %I.%I DEFAULT VALUES','__TARGET__',target_table),
            format('UPDATE %I.%I SET %I=%I WHERE false','__TARGET__',target_table,first_column,first_column),
            format('DELETE FROM %I.%I WHERE false','__TARGET__',target_table)
        ] LOOP
            BEGIN
                EXECUTE operation;
                RAISE EXCEPTION 'Browser operation unexpectedly succeeded';
            EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
            END;
        END LOOP;
    END LOOP;
    IF denied <> 124 THEN RAISE EXCEPTION 'Expected 31 tables times four denied browser operations'; END IF;
    SELECT count(*) INTO observed FROM "__TARGET__".unrelated_sentinel;
    IF observed <> 1 THEN RAISE EXCEPTION 'Same-schema unrelated table lost browser access'; END IF;
    SELECT count(*) INTO observed FROM "__OTHER__".accounts;
    IF observed <> 1 THEN RAISE EXCEPTION 'Other-schema table lost browser access'; END IF;
END
$browser_denials$;
RESET ROLE;
'@

$sql = $begin + "`n" + $v1 + "`n" + $fixture
if ($browserRolesBefore -eq '0') { $sql += "`n" + $v2 + "`n" + $historyCallback + "`n" + $noRoleCheck }
$sql += "`n" + $grants + "`n" + $v2 + "`n" + $historyCallback + "`n" + $ownerChecks
foreach ($browserRole in @('anon','authenticated')) { $sql += "`n" + $browserChecks.Replace('__BROWSER__',$browserRole) }
$sql += "`nSELECT 'ACCESS_CHECK_OK';`nROLLBACK;`n"
$sql = $sql.Replace('__TARGET__',$targetSchema).Replace('__OTHER__',$otherSchema).Replace('__OWNER__',$ownerRole)
$result = Invoke-IsolatedSql $sql
if ($result -ne 'ACCESS_CHECK_OK') { throw 'Access assertions did not finish successfully.' }

$remaining = Invoke-IsolatedSql ("SELECT (SELECT count(*) FROM pg_namespace WHERE nspname IN ('" + $targetSchema + "','" + $otherSchema + "')) || '|' || (SELECT count(*) FROM pg_roles WHERE rolname='" + $ownerRole + "') || '|' || (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated'));")
if ($remaining -ne ('0|0|' + $browserRolesBefore)) { throw 'Transaction rollback left unexpected test schemas or roles.' }
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
# Raw SQL on one connection cannot reveal a migration waiting on Flyway's history lock.
# Execute the installed Flyway library, including automatic SQL callback discovery.
if (-not $Java) { $Java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source } }
if (-not (Test-Path -LiteralPath $Java -PathType Leaf)) { throw 'Java 21 is required for the real Flyway access check.' }
if (-not $RuntimeClasspathFile) {
    if (-not $Gradle) {
        $installedGradle = Get-Command gradle -ErrorAction SilentlyContinue
        $Gradle = if ($installedGradle) { $installedGradle.Source } else { Join-Path $workspace 'backend/gradlew.bat' }
    }
    $initScript = Join-Path $outputDirectory 'runtime-classpath.gradle'
    [IO.File]::WriteAllText($initScript, @'
allprojects {
    tasks.register('printAccessCheckClasspath') {
        doLast { println configurations.runtimeClasspath.asPath }
    }
}
'@, [Text.UTF8Encoding]::new($false))
    $classpathOutput = & $Gradle --project-dir (Join-Path $workspace 'backend') -q --console=plain --init-script $initScript printAccessCheckClasspath 2>&1
    if ($LASTEXITCODE -ne 0) {
        [IO.File]::WriteAllText((Join-Path $outputDirectory 'classpath-error.log'), ($classpathOutput | Out-String))
        throw 'Could not resolve the installed backend runtime dependencies; inspect backend/build/access-check/classpath-error.log.'
    }
    $RuntimeClasspathFile = Join-Path $outputDirectory 'runtime-classpath.txt'
    [IO.File]::WriteAllText($RuntimeClasspathFile, ($classpathOutput | Out-String).Trim(), [Text.UTF8Encoding]::new($false))
}
$runtimeClasspath = [IO.File]::ReadAllText([IO.Path]::GetFullPath($RuntimeClasspathFile)).Trim()
if (-not $runtimeClasspath -or $runtimeClasspath.Contains("`n")) { throw 'Expected one backend runtime classpath line.' }
$flywayOutput = & $Java --class-path $runtimeClasspath (Join-Path $PSScriptRoot 'database-access/FlywayAccessCheck.java') $migrationDirectory 2>&1
$flywayExitCode = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $outputDirectory 'real-flyway.log'), ($flywayOutput | Out-String))
if ($flywayExitCode -ne 0 -or ($flywayOutput | Out-String) -notmatch 'REAL_FLYWAY_ACCESS_OK') {
    throw 'Real Flyway access check failed; inspect backend/build/access-check/real-flyway.log.'
}
$summary = [PSCustomObject]@{success=$true;protectedTables=31;deniedBrowserOperations=248;ownerTableReads=31;sentinelReads=4;publicAndBrowserGrantsRemoved=$true;unrelatedTablesUnchanged=$true;rollbackVerified=$true;genericPostgresNoOpChecked=($browserRolesBefore -eq '0');realFlywayFreshAndUpgrade=$true;realFlywayRepeatAndCallback=$true;realFlywayCleanupVerified=$true}
[IO.File]::WriteAllText((Join-Path $outputDirectory 'summary.json'), ($summary | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$summary | ConvertTo-Json -Compress
