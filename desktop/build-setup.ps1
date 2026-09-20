param([switch]$SkipPublish)
$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$projectRoot = Split-Path $desktopRoot -Parent
$buildRoot = Join-Path $projectRoot 'local-assets/desktop/build'
$releaseRoot = Join-Path $projectRoot 'local-assets/desktop/dist'
$downloads = Join-Path $projectRoot 'local-assets\site\downloads'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$versionSource = & (Join-Path $desktopRoot 'prepare-version.ps1')
$puppy = Join-Path $releaseRoot 'PuppyRuby.exe'
$icon = Join-Path $buildRoot 'ruby-assets\puppy.ico'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x compiler is required.' }
if (-not (Test-Path -LiteralPath $puppy)) { throw 'Build PuppyRuby.exe with desktop/build.ps1 first.' }
if (-not (Test-Path -LiteralPath $icon)) { throw 'Missing puppy icon. Run desktop/build.ps1 first.' }
New-Item -ItemType Directory -Force -Path $releaseRoot,$buildRoot | Out-Null
$executable = Join-Path $releaseRoot 'PuppyRuby-Setup.exe'
$compilerArgs = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    ('/resource:"' + $puppy + '",PuppyRuby.exe'),
    ('/out:"' + $executable + '"'),
    ('/win32manifest:"' + (Join-Path $desktopRoot 'setup.manifest') + '"'),
    ('/win32icon:"' + $icon + '"'),
    ('"' + (Join-Path $desktopRoot 'Setup.cs') + '"'), ('"' + $versionSource + '"'))
$responseFile = Join-Path $buildRoot 'setup-compile.rsp'
[IO.File]::WriteAllLines($responseFile, $compilerArgs, (New-Object Text.UTF8Encoding($true)))
& $compiler ('@' + $responseFile)
if ($LASTEXITCODE -ne 0) { throw 'Windows setup compilation failed.' }
$testRoot = Join-Path $releaseRoot ('setup-tests\' + [Guid]::NewGuid().ToString('N'))
$test = Start-Process -FilePath $executable -ArgumentList @('--self-test', ('"' + $testRoot + '"')) -WindowStyle Hidden -Wait -PassThru
$testReport = Join-Path $testRoot 'self-test.txt'
if ($test.ExitCode -ne 0) {
    if (Test-Path -LiteralPath $testReport) { Get-Content -LiteralPath $testReport -Encoding UTF8 }
    throw ('Windows setup tests failed. Exit code: ' + $test.ExitCode)
}
Copy-Item -LiteralPath $testReport -Destination (Join-Path $buildRoot 'setup-self-test.txt') -Force
Get-Content -LiteralPath $testReport -Encoding UTF8
$hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
[IO.File]::WriteAllText((Join-Path $releaseRoot 'PuppyRuby-Setup.sha256'), $hash + '  PuppyRuby-Setup.exe' + [Environment]::NewLine)
if (-not $SkipPublish) {
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    Copy-Item -LiteralPath $executable -Destination (Join-Path $downloads 'PuppyRuby-Setup.exe') -Force
    Copy-Item -LiteralPath (Join-Path $releaseRoot 'PuppyRuby-Setup.sha256') -Destination (Join-Path $downloads 'PuppyRuby-Setup.sha256') -Force
    $versionInfo = Get-Content -LiteralPath (Join-Path $desktopRoot 'version.json') -Raw | ConvertFrom-Json
    $versionFiles = foreach ($fileName in @('PuppyRuby.exe', 'PuppyRuby-Setup.exe')) {
        $stagedFile = Get-Item -LiteralPath (Join-Path $downloads $fileName)
        $fileVersion = $stagedFile.VersionInfo.FileVersion
        if ($fileVersion -ne $versionInfo.version) { throw ('Desktop payload version mismatch: ' + $fileName) }
        [ordered]@{path=('downloads/' + $fileName); version=$fileVersion; size=$stagedFile.Length; sha256=(Get-FileHash -LiteralPath $stagedFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $buildMetadata = [ordered]@{schemaVersion=1; version=$versionInfo.version; notes=$versionInfo.notes; files=@($versionFiles)}
    [IO.File]::WriteAllText((Join-Path $downloads 'desktop-build.json'), ($buildMetadata | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
}
Write-Output ('Setup ready: ' + $executable)
Write-Output ('SHA256: ' + $hash)
