# Uses only a disposable schema in the explicitly isolated local PostgreSQL fixture.
param([string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe')
$ErrorActionPreference = 'Stop'
if ($env:PUPPY_TEST_ISOLATED -ne '1') { throw 'Set PUPPY_TEST_ISOLATED=1 to run the isolated database-tool check.' }
if (-not (Test-Path -LiteralPath $Psql -PathType Leaf)) { throw 'The PostgreSQL 16 psql executable is required.' }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendDirectory = Join-Path $workspace 'backend'
$databaseTool = Join-Path $backendDirectory 'database.ps1'
$migration = Join-Path $backendDirectory 'src/main/resources/db/migration/postgresql/V1__initial_schema.sql'
$migrationCount = @(Get-ChildItem -LiteralPath (Split-Path $migration) -File -Filter 'V*__*.sql').Count
$outputDirectory = Join-Path $backendDirectory 'build/dbtool-check'
$powershellExecutable = (Get-Process -Id $PID).Path
$schemaCreated = $false
$checks = 0
$savedEnvironment = @{}
$environmentNames = @('DB_URL','DB_USERNAME','DB_PASSWORD','DB_SCHEMA','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGSSLMODE','PGCONNECT_TIMEOUT','PGAPPNAME')
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$nativePreferencePresent = Test-Path Variable:PSNativeCommandUseErrorActionPreference
$nativePreference = if ($nativePreferencePresent) { $PSNativeCommandUseErrorActionPreference } else { $false }
$PSNativeCommandUseErrorActionPreference = $false

function Assert-Check([bool]$Value, [string]$Message) {
    if (-not $Value) { throw $Message }
    $script:checks++
}
function Invoke-Psql([string]$Sql) {
    # -X prevents personal psqlrc files from injecting commands; -w never prompts for credentials.
    $result = $Sql | & $Psql -X -w -h 127.0.0.1 -p 15439 -U flyway_check -d postgres -qAt -v ON_ERROR_STOP=1 -f - 2>&1
    if ($LASTEXITCODE -ne 0) {
        [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
        [IO.File]::WriteAllText((Join-Path $outputDirectory 'fixture-error.log'), ($result | Out-String))
        throw 'Isolated PostgreSQL fixture command failed; inspect the isolated build log.'
    }
    return ($result | Out-String).Trim()
}
function Create-Fixture {
    $null = Invoke-Psql 'CREATE SCHEMA "dbtool_check";'
    $script:schemaCreated = $true
    $ddl = [IO.File]::ReadAllText($migration)
    $null = Invoke-Psql ("SET search_path TO `"dbtool_check`";`n" + $ddl)
}
function Has-History {
    return (Invoke-Psql "SELECT count(*) FROM information_schema.tables WHERE table_schema='dbtool_check' AND table_name='flyway_schema_history';") -eq '1'
}
function Invoke-Tool([string]$Action, [string]$Case, [bool]$ExpectedSuccess, [string]$ExpectedError = '') {
    $arguments = @('-NoProfile','-NonInteractive','-File',$databaseTool,'-Action',$Action,'-NoEnvFile')
    if ($Action -eq 'Baseline') { $arguments += @('-BaselineVersion','1') }
    $result = & $powershellExecutable @arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = $result | Out-String
    [IO.File]::WriteAllText((Join-Path $outputDirectory ($Case + '.log')), $text)
    Assert-Check (($exitCode -eq 0) -eq $ExpectedSuccess) ($Case + ': unexpected tool exit status; inspect isolated build log.')
    Assert-Check ($text -notmatch 'jdbc:|127\.0\.0\.1|15439|flyway_check') ($Case + ': tool output exposed database connection details.')
    $jsonLines = @([regex]::Matches($text, '(?m)^\{"success":.*\}\r?$'))
    Assert-Check ($jsonLines.Count -eq 1) ($Case + ': expected exactly one safe JSON result.')
    $summary = $jsonLines[0].Value | ConvertFrom-Json
    Assert-Check ($summary.success -eq $ExpectedSuccess) ($Case + ': JSON success differs from exit status.')
    if ($ExpectedError) { Assert-Check ($summary.error -eq $ExpectedError) ($Case + ': unexpected error classification.') }
    return $summary
}

try {
    [Environment]::SetEnvironmentVariable('DB_URL','jdbc:postgresql://127.0.0.1:15439/postgres','Process')
    [Environment]::SetEnvironmentVariable('DB_USERNAME','flyway_check','Process')
    [Environment]::SetEnvironmentVariable('DB_PASSWORD','','Process')
    [Environment]::SetEnvironmentVariable('DB_SCHEMA','dbtool_check','Process')
    foreach ($name in @('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGOPTIONS','PGSERVICE','PGSERVICEFILE')) {
        if (Test-Path -LiteralPath ('Env:' + $name)) { Remove-Item -LiteralPath ('Env:' + $name) }
    }
    [Environment]::SetEnvironmentVariable('PGPASSFILE',(Join-Path $outputDirectory 'unused-pgpass'),'Process')
    [Environment]::SetEnvironmentVariable('PGSSLMODE','disable','Process')
    [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT','5','Process')
    [Environment]::SetEnvironmentVariable('PGAPPNAME','puppyruby-dbtool-isolated-check','Process')
    $identity = Invoke-Psql "SELECT host(inet_server_addr()) || '|' || inet_server_port() || '|' || current_database() || '|' || current_user;"
    Assert-Check ($identity -eq '127.0.0.1|15439|postgres|flyway_check') 'Fixture identity differs from the one explicitly authorized for this check.'
    Assert-Check ((Invoke-Psql "SELECT count(*) FROM information_schema.schemata WHERE schema_name='dbtool_check';") -eq '0') 'Refusing to overwrite an existing dbtool_check schema.'
    [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

    # An omitted DB_SCHEMA must use the JDBC default, never silently select another schema.
    $publicBefore = Invoke-Psql "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public';"
    [Environment]::SetEnvironmentVariable('DB_SCHEMA','','Process')
    $null = Invoke-Tool 'Info' 'default-public-info' $true
    Assert-Check ((Invoke-Psql "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public';") -eq $publicBefore) 'Read-only default-schema Info changed public tables.'
    [Environment]::SetEnvironmentVariable('DB_URL','jdbc:postgresql://127.0.0.1:15439/postgres?currentSchema=dbtool_missing','Process')
    $null = Invoke-Tool 'Info' 'reject-unresolved-default-schema' $false 'DEFAULT_SCHEMA_UNRESOLVED'
    [Environment]::SetEnvironmentVariable('DB_URL','jdbc:postgresql://127.0.0.1:15439/postgres','Process')
    [Environment]::SetEnvironmentVariable('DB_SCHEMA','public,other','Process')
    $null = Invoke-Tool 'Info' 'reject-invalid-explicit-schema' $false 'INVALID_SCHEMA_IDENTIFIER'
    [Environment]::SetEnvironmentVariable('DB_SCHEMA','dbtool_check','Process')

    Create-Fixture
    Assert-Check (-not (Has-History)) 'V1 fixture unexpectedly has migration history.'
    $before = Invoke-Tool 'Info' 'before-baseline-info' $true
    Assert-Check ($before.schemaTables -eq 30 -and -not $before.historyPresent -and $before.installed -eq 0 -and $before.pending -eq $migrationCount) 'Initial Info did not report the exact V1 fixture.'
    $null = Invoke-Tool 'Validate' 'reject-unregistered-validate' $false 'HISTORY_NOT_REGISTERED'

    # URL currentSchema simulates an account/connection default that is not public.
    [Environment]::SetEnvironmentVariable('DB_SCHEMA','','Process')
    [Environment]::SetEnvironmentVariable('DB_URL','jdbc:postgresql://127.0.0.1:15439/postgres?currentSchema=dbtool_check','Process')
    $defaultInfo = Invoke-Tool 'Info' 'connection-default-info' $true
    Assert-Check ($defaultInfo.schemaTables -eq 30 -and -not $defaultInfo.historyPresent) 'Omitted DB_SCHEMA did not use the actual JDBC default schema.'

    $null = Invoke-Psql 'CREATE TABLE "dbtool_check"."unexpected_fixture_table" (id integer);'
    $null = Invoke-Tool 'Baseline' 'reject-unknown-table' $false 'BASELINE_TABLE_SET_MISMATCH'
    Assert-Check (-not (Has-History)) 'Rejected unknown-table baseline created migration history.'
    $null = Invoke-Psql 'DROP TABLE "dbtool_check"."unexpected_fixture_table";'

    $null = Invoke-Psql 'ALTER TABLE "dbtool_check"."admin_audit" DROP COLUMN target_type;'
    $null = Invoke-Tool 'Baseline' 'reject-missing-column' $false 'SCHEMA_MISMATCH'
    Assert-Check (-not (Has-History)) 'Rejected missing-column baseline created migration history.'

    # Only the schema created by this run is rebuilt; no other database or schema is touched.
    $null = Invoke-Psql 'DROP SCHEMA "dbtool_check" CASCADE;'
    $schemaCreated = $false
    Create-Fixture
    $null = Invoke-Tool 'Baseline' 'baseline-v1' $true
    Assert-Check (Has-History) 'Successful baseline did not create history.'
    Assert-Check ((Invoke-Psql 'SELECT count(*) FROM "dbtool_check".flyway_schema_history;') -eq '1') 'Baseline must create exactly one history row.'
    Assert-Check ((Invoke-Psql 'SELECT version || ''|'' || type || ''|'' || success::text FROM "dbtool_check".flyway_schema_history;') -eq '1|BASELINE|true') 'History is not the explicitly requested version1 baseline.'

    $null = Invoke-Tool 'Baseline' 'reject-second-baseline' $false 'HISTORY_ALREADY_EXISTS'
    Assert-Check ((Invoke-Psql 'SELECT count(*) FROM "dbtool_check".flyway_schema_history;') -eq '1') 'Repeated baseline altered history.'
    $after = Invoke-Tool 'Info' 'after-baseline-info' $true
    Assert-Check ($after.schemaTables -eq 31 -and $after.historyPresent -and $after.installed -eq 1 -and $after.pending -eq ($migrationCount - 1)) 'Final Info did not report the registered V1 baseline.'
    if ($migrationCount -gt 1) {
        $null = Invoke-Tool 'Validate' 'reject-pending-migration-validate' $false 'MIGRATION_VALIDATION_FAILED'
    } else {
        $null = Invoke-Tool 'Validate' 'after-baseline-validate' $true
    }
    Assert-Check ((Invoke-Psql "SELECT count(*) FROM information_schema.tables WHERE table_schema='dbtool_check';") -eq '31') 'Unexpected table changes during tool operations.'
    Assert-Check ((Invoke-Psql "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public';") -eq $publicBefore) 'Default-schema management touched public while operating on the isolated connection default.'
} finally {
    $cleanupFailed = $false
    if ($schemaCreated) {
        try {
            $null = Invoke-Psql 'DROP SCHEMA "dbtool_check" CASCADE;'
            Assert-Check ((Invoke-Psql "SELECT count(*) FROM information_schema.schemata WHERE schema_name='dbtool_check';") -eq '0') 'Disposable schema cleanup did not finish.'
        } catch { $cleanupFailed = $true }
    }
    foreach ($name in $environmentNames) {
        if ($null -eq $savedEnvironment[$name]) {
            if (Test-Path -LiteralPath ('Env:' + $name)) { Remove-Item -LiteralPath ('Env:' + $name) }
        } else { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
    }
    $PSNativeCommandUseErrorActionPreference = $nativePreference
    if ($cleanupFailed) { throw 'Could not clean up the isolated dbtool_check schema.' }
}
Write-Output ('PASS ' + $checks + ' isolated database-tool checks: optional/default schema, unresolved-schema rejection, baseline, repeat rejection, unknown table, missing column, info, validate, safe output, schema cleanup.')
