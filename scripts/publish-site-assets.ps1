param([ValidateSet('Plan','Publish','Verify')][string]$Action = 'Plan')
$ErrorActionPreference = 'Stop'
$assetProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$assetBackend = Join-Path $assetProject 'backend'
$assetKeys = @('S3_BUCKET','AWS_REGION','S3_KEY_PREFIX','CDN_BASE_URL','CDN_ORIGIN_PATH','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN')
# Configuration is literal data. Credentials stay in the child process environment.
foreach ($assetConfigName in @('.env','.env.local')) {
    $assetConfigPath = Join-Path $assetBackend $assetConfigName
    if (-not (Test-Path -LiteralPath $assetConfigPath)) { continue }
    foreach ($assetLine in [IO.File]::ReadAllLines($assetConfigPath)) {
        $assetEntry = $assetLine.Trim()
        if (-not $assetEntry -or $assetEntry.StartsWith('#')) { continue }
        $assetSeparator = $assetEntry.IndexOf('=')
        if ($assetSeparator -lt 1) { throw 'Invalid backend environment entry.' }
        $assetName = $assetEntry.Substring(0,$assetSeparator).Trim()
        if ($assetName -notin $assetKeys) { continue }
        $assetValue = $assetEntry.Substring($assetSeparator+1).Trim()
        if ($assetValue.Length -ge 2 -and (($assetValue.StartsWith('"') -and $assetValue.EndsWith('"')) -or ($assetValue.StartsWith("'") -and $assetValue.EndsWith("'")))) {
            $assetValue = $assetValue.Substring(1,$assetValue.Length-2)
        }
        [Environment]::SetEnvironmentVariable($assetName,$assetValue,'Process')
    }
}
$assetJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
$assetJavac = Join-Path (Split-Path $assetJava) 'javac.exe'
if (-not (Test-Path -LiteralPath $assetJavac)) { throw 'Install a Java 21 JDK and configure JAVA_HOME.' }
$assetBuild = Join-Path $assetBackend 'build/site-asset-publisher'
New-Item -ItemType Directory -Path $assetBuild -Force | Out-Null
$assetInit = Join-Path $assetBuild 'runtime-classpath.gradle'
@'
allprojects {
    tasks.register("siteAssetRuntimeClasspath") {
        doLast { println sourceSets.main.runtimeClasspath.asPath }
    }
}
'@ | Set-Content -LiteralPath $assetInit -Encoding utf8
Push-Location -LiteralPath $assetBackend
try {
    $assetClasspathOutput = & .\gradlew.bat --offline --quiet --console=plain -I $assetInit siteAssetRuntimeClasspath
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the existing backend SDK classpath offline.' }
    $assetClasspath = $assetClasspathOutput | Where-Object { $_ -match 'spring-boot' } | Select-Object -Last 1
    if (-not $assetClasspath) { throw 'Backend SDK classpath unavailable.' }
    & $assetJavac -cp $assetClasspath -d $assetBuild (Join-Path $PSScriptRoot 'SiteAssetPublisher.java')
    if ($LASTEXITCODE -ne 0) { throw 'Site asset publisher compilation failed.' }
    # Uses local-assets/site only, preserving URL paths and the immutable 705-image baseline.
    & $assetJava -cp ($assetBuild + ';' + $assetClasspath) SiteAssetPublisher $assetProject $Action
    if ($LASTEXITCODE -ne 0) { throw 'Site asset publisher failed. Review its safe error code above.' }
} finally { Pop-Location }
