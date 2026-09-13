param([int]$Port = 0)
$ErrorActionPreference = 'Stop'
$serverDirectory = $PSScriptRoot
$supportedSettings = @('PORT','SERVER_ADDRESS','PUBLIC_SITE_URL','ADMIN_EMAIL','DB_URL','DB_USERNAME','DB_PASSWORD','DB_SCHEMA','DB_POOL_MAX_SIZE','DB_POOL_MIN_IDLE','FLYWAY_ENABLED',
    'KAKAO_REST_API_KEY','KAKAO_CLIENT_SECRET','MAIL_ENABLED','MAIL_HOST','MAIL_PORT','MAIL_USERNAME','MAIL_PASSWORD','MAIL_FROM','MAIL_STARTTLS',
    'TOSS_CLIENT_KEY','TOSS_SECRET_KEY','TOSS_LIVE_ENABLED',
    'S3_UPLOAD_ENABLED','S3_BUCKET','AWS_REGION','S3_KEY_PREFIX','CDN_BASE_URL','CDN_ORIGIN_PATH',
    'S3_PRESIGN_TTL_SECONDS','S3_MAX_UPLOAD_BYTES','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN')

# Treat configuration as literal data; never execute its contents as PowerShell.
# Local overrides take precedence; -Port below remains the final explicit override.
foreach ($configName in @('.env', '.env.local')) {
    $localConfig = Join-Path $serverDirectory $configName
    if (-not (Test-Path -LiteralPath $localConfig)) { continue }
    foreach ($configLine in [IO.File]::ReadAllLines($localConfig)) {
        $settingLine = $configLine.Trim()
        if (-not $settingLine -or $settingLine.StartsWith('#')) { continue }
        $separator = $settingLine.IndexOf('=')
        if ($separator -lt 1) { throw 'Invalid backend environment entry.' }
        $settingName = $settingLine.Substring(0, $separator).Trim()
        if ($settingName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Invalid backend environment variable name.' }
        if ($settingName -notin $supportedSettings) { throw ('Unsupported server setting: ' + $settingName) }
        $settingValue = $settingLine.Substring($separator + 1).Trim()
        if ($settingValue.Length -ge 2 -and (($settingValue.StartsWith('"') -and $settingValue.EndsWith('"')) -or ($settingValue.StartsWith("'") -and $settingValue.EndsWith("'")))) {
            $settingValue = $settingValue.Substring(1, $settingValue.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($settingName, $settingValue, 'Process')
    }
}
if ($Port -ne 0) {
    if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
    $env:PORT = [string]$Port
}
$serverJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $serverJava)) { throw 'Install Java 21 and configure JAVA_HOME first.' }
$serverJar = Get-ChildItem -LiteralPath (Join-Path $serverDirectory 'build/libs') -File |
    Where-Object { $_.Name -match '^puppyruby-api-[\d.]+\.jar$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $serverJar) { throw 'Build the server first with .\gradlew.bat bootJar.' }
# Run an immutable copy so rebuilding the downloadable JAR cannot change classes
# underneath the local server while it is serving requests.
$serverRuntimeDirectory = Join-Path $serverDirectory 'build/runtime'
New-Item -ItemType Directory -Path $serverRuntimeDirectory -Force | Out-Null
$serverJarHash = (Get-FileHash -LiteralPath $serverJar.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$serverRuntimeJar = Join-Path $serverRuntimeDirectory ('puppyruby-api-' + $serverJarHash + '.jar')
if (-not (Test-Path -LiteralPath $serverRuntimeJar)) {
    Copy-Item -LiteralPath $serverJar.FullName -Destination $serverRuntimeJar
}
Push-Location -LiteralPath $serverDirectory
try {
    & $serverJava -jar $serverRuntimeJar
    if ($LASTEXITCODE -ne 0) { throw ('The server stopped with exit code ' + $LASTEXITCODE) }
} finally { Pop-Location }
