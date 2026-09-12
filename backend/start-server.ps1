param([int]$Port = 0)
$ErrorActionPreference = 'Stop'
$serverDirectory = $PSScriptRoot
$localConfig = Join-Path $serverDirectory '.env.local'
$supportedSettings = @('PORT','SERVER_ADDRESS','PUBLIC_SITE_URL','ADMIN_EMAIL','DB_URL','DB_USERNAME','DB_PASSWORD',
    'KAKAO_REST_API_KEY','KAKAO_CLIENT_SECRET','MAIL_ENABLED','MAIL_HOST','MAIL_PORT','MAIL_USERNAME','MAIL_PASSWORD','MAIL_FROM','MAIL_STARTTLS',
    'TOSS_CLIENT_KEY','TOSS_SECRET_KEY','TOSS_LIVE_ENABLED')

# Treat configuration as literal data; never execute its contents as PowerShell.
if (Test-Path -LiteralPath $localConfig) {
    foreach ($configLine in [IO.File]::ReadAllLines($localConfig)) {
        $settingLine = $configLine.Trim()
        if (-not $settingLine -or $settingLine.StartsWith('#')) { continue }
        $separator = $settingLine.IndexOf('=')
        if ($separator -lt 1) { throw 'Invalid backend/.env.local entry.' }
        $settingName = $settingLine.Substring(0, $separator).Trim()
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
Push-Location -LiteralPath $serverDirectory
try {
    & $serverJava -jar $serverJar.FullName
    if ($LASTEXITCODE -ne 0) { throw ('The server stopped with exit code ' + $LASTEXITCODE) }
} finally { Pop-Location }
