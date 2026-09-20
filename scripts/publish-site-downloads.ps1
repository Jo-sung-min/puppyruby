param([ValidateSet('Plan','Publish','Verify')][string]$Action = 'Plan', [switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$downloadProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$downloadBackend = Join-Path $downloadProject 'backend'
if (-not $TestOnly) {
    $downloadVersion = (Get-Content -LiteralPath (Join-Path $downloadProject 'desktop/version.json') -Raw | ConvertFrom-Json).version
    if ($downloadVersion -notmatch '^(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){3}$') { throw 'Invalid desktop release version.' }
    foreach ($downloadBinaryName in @('PuppyRuby.exe','PuppyRuby-Setup.exe')) {
        $downloadBinaryPath = Join-Path $downloadProject ('local-assets/site/downloads/' + $downloadBinaryName)
        $downloadFileVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($downloadBinaryPath).FileVersion
        if ($downloadFileVersion -ne $downloadVersion) { throw ('Build desktop/ first: staged ' + $downloadBinaryName + ' version does not match desktop/version.json.') }
    }
}
$downloadKeys = @('S3_BUCKET','AWS_REGION','S3_KEY_PREFIX','CDN_BASE_URL','CDN_ORIGIN_PATH','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN')
# Configuration is literal data. Credentials stay in the child process environment.
if (-not $TestOnly) { foreach ($downloadConfigName in @('.env','.env.local')) {
    $downloadConfigPath = Join-Path $downloadBackend $downloadConfigName
    if (-not (Test-Path -LiteralPath $downloadConfigPath)) { continue }
    foreach ($downloadLine in [IO.File]::ReadAllLines($downloadConfigPath)) {
        $downloadEntry = $downloadLine.Trim().TrimStart([char]0xFEFF)
        if (-not $downloadEntry -or $downloadEntry.StartsWith('#')) { continue }
        if ($downloadEntry.StartsWith('export ')) { $downloadEntry = $downloadEntry.Substring(7).TrimStart() }
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
} }
$downloadJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
$downloadJavac = Join-Path (Split-Path $downloadJava) 'javac.exe'
if (-not (Test-Path -LiteralPath $downloadJavac)) { throw 'Install a Java 21 JDK and configure JAVA_HOME.' }
$downloadBuild = Join-Path $downloadBackend 'build/site-download-publisher'
New-Item -ItemType Directory -Path $downloadBuild -Force | Out-Null

function Assert-DownloadBuildPath {
    param([string]$Path, [string]$Backend)
    $downloadBoundary = [IO.Path]::GetFullPath((Join-Path $Backend 'build')).TrimEnd('\','/')
    $downloadResolved = [IO.Path]::GetFullPath($Path)
    if (-not $downloadResolved.StartsWith($downloadBoundary + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backend runtime path is outside the build directory.'
    }
    for ($downloadCheck = $downloadResolved; $downloadCheck.Length -ge $downloadBoundary.Length; $downloadCheck = [IO.Path]::GetDirectoryName($downloadCheck)) {
        if (Test-Path -LiteralPath $downloadCheck) {
            $downloadItem = Get-Item -LiteralPath $downloadCheck -Force
            if ($downloadItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backend runtime path cannot contain symbolic links or junctions.' }
        }
        if ($downloadCheck.Equals($downloadBoundary,[StringComparison]::OrdinalIgnoreCase)) { break }
    }
}

function Get-DownloadBootRuntimeClasspath {
    param([string]$Backend, [string]$Build)
    $downloadBoot = Get-ChildItem -LiteralPath (Join-Path $Backend 'build/libs') -Filter 'puppyruby-api-*.jar' -File -ErrorAction SilentlyContinue |
        Where-Object Name -NotLike '*-plain.jar' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -eq $downloadBoot) { throw 'Offline Gradle metadata and a built backend JAR are both unavailable. Build backend/ once, then retry.' }
    Assert-DownloadBuildPath -Path $downloadBoot.FullName -Backend $Backend
    $downloadBootHash = (Get-FileHash -LiteralPath $downloadBoot.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $downloadRuntime = Join-Path $Build ('boot-runtime-' + $downloadBootHash.Substring(0,16))
    Assert-DownloadBuildPath -Path $downloadRuntime -Backend $Backend
    New-Item -ItemType Directory -Path $downloadRuntime -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $downloadArchive = [IO.Compression.ZipFile]::OpenRead($downloadBoot.FullName)
    try {
        $downloadEntries = @($downloadArchive.Entries | Where-Object { $_.FullName -match '^BOOT-INF/lib/[A-Za-z0-9][A-Za-z0-9_.+-]*\.jar$' } | Sort-Object Name)
        if ($downloadEntries.Count -lt 10) { throw 'Built backend JAR does not contain a complete runtime library set.' }
        $downloadNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $downloadJars = foreach ($downloadEntry in $downloadEntries) {
            if (-not $downloadNames.Add($downloadEntry.Name)) { throw 'Built backend JAR contains duplicate runtime library names.' }
            $downloadTarget = [IO.Path]::GetFullPath((Join-Path $downloadRuntime $downloadEntry.Name))
            Assert-DownloadBuildPath -Path $downloadTarget -Backend $Backend
            [IO.Compression.ZipFileExtensions]::ExtractToFile($downloadEntry,$downloadTarget,$true)
            $downloadTarget
        }
    } finally { $downloadArchive.Dispose() }
    foreach ($downloadRequired in @('s3-*.jar','sdk-core-*.jar','jackson-databind-*.jar')) {
        if (-not ($downloadEntries | Where-Object Name -Like $downloadRequired)) { throw ('Built backend runtime is missing ' + $downloadRequired) }
    }
    if ((Get-FileHash -LiteralPath $downloadBoot.FullName -Algorithm SHA256).Hash -ne $downloadBootHash) { throw 'Built backend runtime changed during extraction.' }
    # Only this JAR's exact library list enters the classpath. Stale cached files
    # cannot add libraries, and no wrapper download or dependency fetch is needed.
    return ($downloadJars -join ';')
}

$downloadInit = Join-Path $downloadBuild 'runtime-classpath.gradle'
$downloadInitSource = @'
allprojects {
    tasks.register("siteDownloadRuntimeClasspath") {
        doLast { println sourceSets.main.runtimeClasspath.asPath }
    }
}
'@
[IO.File]::WriteAllText($downloadInit,$downloadInitSource,[Text.UTF8Encoding]::new($false))
$downloadSystemGradle = Get-Command gradle.bat -ErrorAction SilentlyContinue
Push-Location -LiteralPath $downloadBackend
try {
    $downloadClasspath = $null
    if ($downloadSystemGradle) {
        try {
            $downloadClasspathOutput = @(& $downloadSystemGradle.Source --offline --quiet --console=plain -I $downloadInit siteDownloadRuntimeClasspath 2>&1)
            if ($LASTEXITCODE -eq 0) { $downloadClasspath = $downloadClasspathOutput | Where-Object { $_ -match 'spring-boot' } | Select-Object -Last 1 }
        } catch { $downloadClasspath = $null }
    }
    if ($downloadClasspath) {
        $downloadGradleJars = @(([string]$downloadClasspath -split ';') | Where-Object { $_.EndsWith('.jar',[StringComparison]::OrdinalIgnoreCase) })
        if ($downloadGradleJars.Count -lt 10 -or @($downloadGradleJars | Where-Object { -not [IO.File]::Exists($_) }).Count) { $downloadClasspath = $null }
    }
    $downloadRuntimeSource = 'gradle-offline'
    if (-not $downloadClasspath) {
        $downloadClasspath = Get-DownloadBootRuntimeClasspath -Backend $downloadBackend -Build $downloadBuild
        $downloadRuntimeSource = 'built-backend-jar'
    }
    [IO.File]::WriteAllText((Join-Path $downloadBuild 'runtime-classpath.txt'),[string]$downloadClasspath,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $downloadBuild 'runtime-source.txt'),$downloadRuntimeSource,[Text.UTF8Encoding]::new($false))
    & $downloadJavac -encoding UTF-8 -cp $downloadClasspath -d $downloadBuild (Join-Path $downloadBackend 'src/main/java/com/puppyruby/game/BreedCatalog.java') (Join-Path $PSScriptRoot 'SiteDownloadPublisher.java') (Join-Path $PSScriptRoot 'SiteDownloadPublisherTest.java')
    if ($LASTEXITCODE -ne 0) { throw 'Site download publisher compilation failed.' }
    if ($TestOnly) {
        & $downloadJava -cp ($downloadBuild + ';' + $downloadClasspath) SiteDownloadPublisherTest $downloadProject
    } else {
        # Publishes only the two desktop executables and their checksum sidecars.
        & $downloadJava -cp ($downloadBuild + ';' + $downloadClasspath) SiteDownloadPublisher $downloadProject $Action
    }
    if ($LASTEXITCODE -ne 0) { throw 'Site download publisher failed. Review its safe error code above.' }
} finally { Pop-Location }
