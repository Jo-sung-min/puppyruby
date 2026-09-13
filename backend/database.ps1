param(
    [Parameter(Mandatory = $true)][ValidateSet('Info','Validate','Baseline')][string]$Action,
    [string]$BaselineVersion,
    [switch]$NoEnvFile
)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'Baseline' -and $BaselineVersion -ne '1') { throw 'Baseline requires explicit -BaselineVersion 1 after backup and schema review.' }
if ($Action -ne 'Baseline' -and $PSBoundParameters.ContainsKey('BaselineVersion')) { throw 'BaselineVersion is only valid with Baseline.' }
$databaseDirectory = $PSScriptRoot
$databaseKeys = @('DB_URL','DB_USERNAME','DB_PASSWORD','DB_SCHEMA')
if (-not $NoEnvFile) {
    foreach ($configName in @('.env', '.env.local')) {
        $configPath = Join-Path $databaseDirectory $configName
        if (-not (Test-Path -LiteralPath $configPath)) { continue }
        foreach ($configLine in [IO.File]::ReadAllLines($configPath)) {
            $line = $configLine.Trim()
            if (-not $line -or $line.StartsWith('#')) { continue }
            $separator = $line.IndexOf('=')
            if ($separator -lt 1) { throw 'Invalid backend environment entry.' }
            $key = $line.Substring(0, $separator).Trim()
            if ($key -notin $databaseKeys) { continue }
            $value = $line.Substring($separator + 1).Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}
$databaseArgs = @('database', '--offline', '--quiet', '--console=plain', ('-PdbAction=' + $Action))
if ($Action -eq 'Baseline') { $databaseArgs += '-PbaselineVersion=1' }
Push-Location -LiteralPath $databaseDirectory
try {
    # Credentials travel only in the child process environment, never command-line arguments.
    & (Join-Path $databaseDirectory 'gradlew.bat') @databaseArgs
    if ($LASTEXITCODE -ne 0) { throw 'Database command failed. Review the safe error classification above.' }
} finally { Pop-Location }
