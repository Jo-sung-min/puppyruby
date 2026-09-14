param([ValidateSet('Plan','Publish','Verify')][string]$Action = 'Plan', [switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$rubyProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rubyBackend = Join-Path $rubyProject 'backend'
$rubyKeys = @('S3_BUCKET','AWS_REGION','S3_KEY_PREFIX','CDN_BASE_URL','CDN_ORIGIN_PATH','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN')
# Read literal allowlisted configuration only. Credentials are never arguments or output.
if (-not $TestOnly) {
    foreach ($rubyName in @('.env','.env.local')) {
        $rubyConfig = Join-Path $rubyBackend $rubyName
        if (-not (Test-Path -LiteralPath $rubyConfig)) { continue }
        foreach ($rubyLine in [IO.File]::ReadAllLines($rubyConfig)) {
            $rubyEntry = $rubyLine.Trim().TrimStart([char]0xFEFF)
            if (-not $rubyEntry -or $rubyEntry.StartsWith('#')) { continue }
            if ($rubyEntry.StartsWith('export ')) { $rubyEntry = $rubyEntry.Substring(7).TrimStart() }
            $rubySeparator = $rubyEntry.IndexOf('=')
            if ($rubySeparator -lt 1) { throw 'Invalid backend environment entry.' }
            $rubyKey = $rubyEntry.Substring(0,$rubySeparator).Trim()
            if ($rubyKey -notin $rubyKeys) { continue }
            $rubyValue = $rubyEntry.Substring($rubySeparator+1).Trim()
            if ($rubyValue.Length -ge 2 -and (($rubyValue.StartsWith('"') -and $rubyValue.EndsWith('"')) -or ($rubyValue.StartsWith("'") -and $rubyValue.EndsWith("'")))) {
                $rubyValue = $rubyValue.Substring(1,$rubyValue.Length-2)
            }
            [Environment]::SetEnvironmentVariable($rubyKey,$rubyValue,'Process')
        }
    }
}
$rubyJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
$rubyJavac = Join-Path (Split-Path $rubyJava) 'javac.exe'
if (-not (Test-Path -LiteralPath $rubyJavac)) { throw 'Install Java 21 JDK and configure JAVA_HOME.' }
$rubyBuild = Join-Path $rubyBackend 'build/ruby-round-publisher'
New-Item -ItemType Directory -Path $rubyBuild -Force | Out-Null
$rubyInit = Join-Path $rubyBuild 'runtime-classpath.gradle'
@'
allprojects {
    tasks.register("rubyRoundRuntimeClasspath") {
        doLast { println sourceSets.main.runtimeClasspath.asPath }
    }
}
'@ | Set-Content -LiteralPath $rubyInit -Encoding utf8
$rubySystemGradle = Get-Command gradle.bat -ErrorAction SilentlyContinue
$rubyGradle = if ($rubySystemGradle) { $rubySystemGradle.Source } else { Join-Path $rubyBackend 'gradlew.bat' }
Push-Location -LiteralPath $rubyBackend
try {
    $rubyOutput = & $rubyGradle --offline --quiet --console=plain -I $rubyInit rubyRoundRuntimeClasspath
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve installed backend SDK classpath offline.' }
    $rubyClasspath = $rubyOutput | Where-Object { $_ -match 'spring-boot' } | Select-Object -Last 1
    if (-not $rubyClasspath) { throw 'Backend SDK classpath unavailable.' }
    & $rubyJavac -encoding UTF-8 -cp $rubyClasspath -d $rubyBuild (Join-Path $PSScriptRoot 'SiteDownloadPublisher.java') (Join-Path $PSScriptRoot 'RubyRoundAssetPublisher.java') (Join-Path $PSScriptRoot 'RubyRoundAssetPublisherTest.java')
    if ($LASTEXITCODE -ne 0) { throw 'Ruby Round publisher compilation failed.' }
    if ($TestOnly) {
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) RubyRoundAssetPublisherTest $rubyBuild
        if ($LASTEXITCODE -ne 0) { throw 'Ruby Round offline integrity tests failed.' }
        & $rubyJavac -encoding UTF-8 -cp ($rubyBuild + ';' + $rubyClasspath) -d $rubyBuild (Join-Path $PSScriptRoot 'SiteAssetPublisher.java') (Join-Path $PSScriptRoot 'LegacyMediaIsolationTest.java')
        if ($LASTEXITCODE -ne 0) { throw 'Legacy media isolation test compilation failed.' }
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) LegacyMediaIsolationTest $rubyProject
    } else {
        # Exact 511 paths; no traversal, deletion, old-release updates or server binaries.
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) RubyRoundAssetPublisher $rubyProject $Action
    }
    if ($LASTEXITCODE -ne 0) { throw 'Ruby Round publisher failed. Review its safe error code above.' }
} finally { Pop-Location }
