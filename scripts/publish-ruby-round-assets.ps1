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

function Get-RubyBootRuntimeClasspath {
    param([string]$Backend, [string]$Build)
    $rubyLibs = Join-Path $Backend 'build/libs'
    $rubyBoot = Get-ChildItem -LiteralPath $rubyLibs -Filter 'puppyruby-api-*.jar' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -eq $rubyBoot) {
        throw 'Offline Gradle metadata and a built backend JAR are both unavailable. Build backend/ once, then retry.'
    }
    $rubyBuildBoundary = [IO.Path]::GetFullPath((Join-Path $Backend 'build')).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    $rubyBootPath = [IO.Path]::GetFullPath($rubyBoot.FullName)
    if (-not $rubyBootPath.StartsWith($rubyBuildBoundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Backend runtime JAR is outside the build directory.' }
    $rubyBootHash = (Get-FileHash -LiteralPath $rubyBootPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $rubyRuntime = Join-Path $Build ('boot-runtime-' + $rubyBootHash.Substring(0,16))
    New-Item -ItemType Directory -Path $rubyRuntime -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $rubyArchive = [IO.Compression.ZipFile]::OpenRead($rubyBootPath)
    try {
        $rubyEntries = @($rubyArchive.Entries | Where-Object { $_.FullName -match '^BOOT-INF/lib/[^/]+\.jar$' })
        if ($rubyEntries.Count -lt 10) { throw 'Built backend JAR does not contain a complete runtime library set.' }
        foreach ($rubyEntry in $rubyEntries) {
            $rubyTarget = [IO.Path]::GetFullPath((Join-Path $rubyRuntime $rubyEntry.Name))
            $rubyRuntimeBoundary = [IO.Path]::GetFullPath($rubyRuntime).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
            if (-not $rubyTarget.StartsWith($rubyRuntimeBoundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid nested runtime library path.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($rubyEntry,$rubyTarget,$true)
        }
    } finally { $rubyArchive.Dispose() }
    $rubyJars = @(Get-ChildItem -LiteralPath $rubyRuntime -Filter '*.jar' -File | Sort-Object Name)
    foreach ($rubyRequired in @('s3-*.jar','sdk-core-*.jar','jackson-databind-*.jar')) {
        if (-not ($rubyJars | Where-Object Name -Like $rubyRequired)) { throw ('Built backend runtime is missing ' + $rubyRequired) }
    }
    return ($rubyJars.FullName -join ';')
}

$rubyInit = Join-Path $rubyBuild 'runtime-classpath.gradle'
$rubyInitSource=@'
allprojects {
    tasks.register("rubyRoundRuntimeClasspath") {
        doLast { println sourceSets.main.runtimeClasspath.asPath }
    }
}
'@
[IO.File]::WriteAllText($rubyInit,$rubyInitSource,[Text.UTF8Encoding]::new($false))
$rubySystemGradle = Get-Command gradle.bat -ErrorAction SilentlyContinue
$rubyGradle = if ($rubySystemGradle) { $rubySystemGradle.Source } else { Join-Path $rubyBackend 'gradlew.bat' }
Push-Location -LiteralPath $rubyBackend
try {
    $rubyGradleOutput = @()
    $rubyGradleExit = 1
    try {
        $rubyGradleOutput = @(& $rubyGradle --offline --quiet --console=plain -I $rubyInit rubyRoundRuntimeClasspath 2>&1)
        $rubyGradleExit = $LASTEXITCODE
    } catch { $rubyGradleExit = 1 }
    $rubyClasspath = if ($rubyGradleExit -eq 0) {
        $rubyGradleOutput | Where-Object { $_ -match 'spring-boot' } | Select-Object -Last 1
    } else { $null }
    $rubyRuntimeSource = 'gradle-offline'
    if (-not $rubyClasspath) {
        $rubyClasspath = Get-RubyBootRuntimeClasspath -Backend $rubyBackend -Build $rubyBuild
        $rubyRuntimeSource = 'built-backend-jar'
    }
    [IO.File]::WriteAllText((Join-Path $rubyBuild 'runtime-classpath.txt'),[string]$rubyClasspath,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $rubyBuild 'runtime-source.txt'),$rubyRuntimeSource,[Text.UTF8Encoding]::new($false))
    $rubyBreedCatalog = Join-Path $rubyBackend 'src/main/java/com/puppyruby/game/BreedCatalog.java'
    & $rubyJavac -encoding UTF-8 -cp $rubyClasspath -d $rubyBuild $rubyBreedCatalog (Join-Path $PSScriptRoot 'SiteDownloadPublisher.java') (Join-Path $PSScriptRoot 'RubyRoundAssetPublisher.java') (Join-Path $PSScriptRoot 'RubyRoundAssetPublisherTest.java')
    if ($LASTEXITCODE -ne 0) { throw 'Ruby Round publisher compilation failed.' }
    if ($TestOnly) {
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) RubyRoundAssetPublisherTest $rubyBuild $rubyProject
        if ($LASTEXITCODE -ne 0) { throw 'Ruby Round offline integrity tests failed.' }
        & $rubyJavac -encoding UTF-8 -cp ($rubyBuild + ';' + $rubyClasspath) -d $rubyBuild (Join-Path $PSScriptRoot 'SiteAssetPublisher.java') (Join-Path $PSScriptRoot 'LegacyMediaIsolationTest.java')
        if ($LASTEXITCODE -ne 0) { throw 'Legacy media isolation test compilation failed.' }
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) LegacyMediaIsolationTest $rubyProject
    } else {
        # Exact legacy + 16-action + catalog accessory paths only; no traversal, deletion, old-release updates or server binaries.
        & $rubyJava -cp ($rubyBuild + ';' + $rubyClasspath) RubyRoundAssetPublisher $rubyProject $Action
    }
    if ($LASTEXITCODE -ne 0) { throw 'Ruby Round publisher failed. Review its safe error code above.' }
} finally { Pop-Location }
