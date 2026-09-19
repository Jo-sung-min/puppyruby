param([ValidateSet('Plan','Publish','Verify')][string]$Action = 'Plan')
$ErrorActionPreference = 'Stop'
$downloadProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$downloadBackend = Join-Path $downloadProject 'backend'
$downloadKeys = @('S3_BUCKET','AWS_REGION','S3_KEY_PREFIX','CDN_BASE_URL','CDN_ORIGIN_PATH','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN')
# Configuration is literal data. Credentials stay in the child process environment.
foreach ($downloadConfigName in @('.env','.env.local')) {
    $downloadConfigPath = Join-Path $downloadBackend $downloadConfigName
    if (-not (Test-Path -LiteralPath $downloadConfigPath)) { continue }
    foreach ($downloadLine in [IO.File]::ReadAllLines($downloadConfigPath)) {
        $downloadEntry = $downloadLine.Trim()
        if (-not $downloadEntry -or $downloadEntry.StartsWith('#')) { continue }
        $downloadSeparator = $downloadEntry.IndexOf('=')
        if ($downloadSeparator -lt 1) { throw 'Invalid backend environment entry.' }
        $downloadName = $downloadEntry.Substring(0,$downloadSeparator).Trim()
        if ($downloadName -notin $downloadKeys) { continue }
        $downloadValue = $downloadEntry.Substring($downloadSeparator+1).Trim()
        if ($downloadValue.Length -ge 2 -and (($downloadValue.StartsWith('"') -and $downloadValue.EndsWith('"')) -or ($downloadValue.StartsWith("'") -and $downloadValue.EndsWith("'")))) {
            $downloadValue = $downloadValue.Substring(1,$downloadValue.Length-2)
        }
        [Environment]::SetEnvironmentVariable($downloadName,$downloadValue,'Process')
    }
}
$downloadJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
$downloadJavac = Join-Path (Split-Path $downloadJava) 'javac.exe'
if (-not (Test-Path -LiteralPath $downloadJavac)) { throw 'Install a Java 21 JDK and configure JAVA_HOME.' }
$downloadBuild = Join-Path $downloadBackend 'build/site-download-publisher'
New-Item -ItemType Directory -Path $downloadBuild -Force | Out-Null
$downloadInit = Join-Path $downloadBuild 'runtime-classpath.gradle'
@'
allprojects {
    tasks.register("siteDownloadRuntimeClasspath") {
        doLast { println sourceSets.main.runtimeClasspath.asPath }
    }
}
'@ | Set-Content -LiteralPath $downloadInit -Encoding utf8
Push-Location -LiteralPath $downloadBackend
try {
    $downloadClasspathOutput = & .\gradlew.bat --offline --quiet --console=plain -I $downloadInit siteDownloadRuntimeClasspath
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the existing backend SDK classpath offline.' }
    $downloadClasspath = $downloadClasspathOutput | Where-Object { $_ -match 'spring-boot' } | Select-Object -Last 1
    if (-not $downloadClasspath) { throw 'Backend SDK classpath unavailable.' }
    & $downloadJavac -cp $downloadClasspath -d $downloadBuild (Join-Path $PSScriptRoot 'SiteDownloadPublisher.java')
    if ($LASTEXITCODE -ne 0) { throw 'Site download publisher compilation failed.' }
    # Publishes only the two desktop executables and their checksum sidecars.
    & $downloadJava -cp ($downloadBuild + ';' + $downloadClasspath) SiteDownloadPublisher $downloadProject $Action
    if ($LASTEXITCODE -ne 0) { throw 'Site download publisher failed. Review its safe error code above.' }
} finally { Pop-Location }
