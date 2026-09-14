param([int]$Port = 0)
$ErrorActionPreference = 'Stop'
$serverDirectory = $PSScriptRoot
# Java loads .env and .env.local. Keep command-line overrides explicit.
$serverArguments = @()
if ($Port -ne 0) {
    if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
    $serverArguments += ('--server.port=' + $Port)
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
    & $serverJava -jar $serverRuntimeJar @serverArguments
    if ($LASTEXITCODE -ne 0) { throw ('The server stopped with exit code ' + $LASTEXITCODE) }
} finally { Pop-Location }
