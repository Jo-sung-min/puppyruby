param([switch]$SkipExport, [switch]$SkipPublish)
$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$projectRoot = Split-Path $desktopRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x compiler is required.' }
$versionSource = & (Join-Path $desktopRoot 'prepare-version.ps1')

if (-not $SkipExport) {
    & node (Join-Path $desktopRoot 'export-ruby-default.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Ruby Dot default sprite export failed.' }
}
$buildRoot = Join-Path $projectRoot 'local-assets/desktop/build'
$assetRoot = Join-Path $buildRoot 'ruby-assets'
$releaseRoot = Join-Path $projectRoot 'local-assets/desktop/dist'
$downloads = Join-Path $projectRoot 'local-assets\site\downloads'
New-Item -ItemType Directory -Force -Path $releaseRoot,$downloads | Out-Null
$executable = Join-Path $releaseRoot 'PuppyRuby.exe'
$compilerArgs = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll', '/reference:System.Web.Extensions.dll', '/reference:System.Net.Http.dll', '/reference:System.Security.dll',
    ('/resource:"' + (Join-Path $projectRoot 'shared\commands.json') + '",commands.json'),
    ('/out:"' + $executable + '"'),
    ('/win32manifest:"' + (Join-Path $desktopRoot 'app.manifest') + '"'),
    ('/win32icon:"' + (Join-Path $assetRoot 'puppy.ico') + '"'))
$assetFiles = @(Get-ChildItem -LiteralPath $assetRoot -File)
$rubySprites = @($assetFiles | Where-Object { $_.Name -match '^ruby-default-[a-z]+-(?:idle|side|walk|happy|sleep)\.rubypng$' })
$fixedResources = @('breed-catalog.json', 'puppy.ico', 'ruby-default-manifest.json')
$bundleManifest = Get-Content -LiteralPath (Join-Path $assetRoot 'ruby-default-manifest.json') -Raw | ConvertFrom-Json
$nativeBundle = $null -ne $bundleManifest.breeds[0].nativeActions
$bodyPattern = '^ruby-body-[a-z]+-(?:idle|side|walk|happy|sleep|typing|petting|eat|belly|stretch|wag|scratch|walk-left|walk-right|walk-up|walk-down)\.rubypng$'
$rubyBodies = @($assetFiles | Where-Object { $_.Name -match $bodyPattern })
$unexpected = @($assetFiles | Where-Object { $fixedResources -notcontains $_.Name -and $_.Name -notmatch '^ruby-default-[a-z]+-(?:idle|side|walk|happy|sleep)\.rubypng$' -and -not($nativeBundle -and ($_.Name -match $bodyPattern -or $_.Name -eq 'ruby-eye-01.rubypng')) })
if ($rubySprites.Count -ne 150 -or $unexpected.Count -ne 0) {
    throw ('Invalid finite Ruby desktop resource inventory. Legacy sprites=' + $rubySprites.Count + ', unexpected=' + ($unexpected.Name -join ','))
}
if ($nativeBundle -and ($rubyBodies.Count -ne 480 -or -not(Test-Path -LiteralPath (Join-Path $assetRoot 'ruby-eye-01.rubypng') -PathType Leaf))) { throw 'Native Ruby bundle requires all480 body strips and the shared default eye pair.' }
foreach ($required in $fixedResources) { if (-not (Test-Path -LiteralPath (Join-Path $assetRoot $required) -PathType Leaf)) { throw ('Missing Ruby desktop resource: ' + $required) } }
$managedResources = @($assetFiles | Sort-Object Name)
$expectedResourceCount = if($nativeBundle){634}else{153}
if ($managedResources.Count -ne $expectedResourceCount) { throw ('Unexpected managed Ruby resource count: ' + $managedResources.Count) }
$managedResources | ForEach-Object {
    $compilerArgs += '/resource:"' + $_.FullName + '",' + $_.Name
}
foreach ($source in @('NativeInput.cs', 'PetState.cs', 'PetMotion.cs', 'PetMotionTest.cs', 'PetBubble.cs', 'PetUpdateBadge.cs', 'DesktopUpdate.cs', 'Commands.cs', 'Progression.cs', 'AskWindow.cs', 'DesktopBreedCatalog.cs', 'DesktopSync.cs', 'DesktopAppearanceCache.cs', 'DesktopAppearanceFrames.cs', 'DesktopAccessoryRenderer.cs', 'DesktopAppearanceReactions.cs', 'BundledRubyAppearanceLibrary.cs', 'DesktopAppearanceFramesTest.cs', 'DesktopAppearanceDiagnostic.cs', 'LinkWindow.cs', 'SyncTest.cs', 'Program.cs')) { $compilerArgs += '"' + (Join-Path $desktopRoot $source) + '"' }
$compilerArgs += '"' + $versionSource + '"'
$responseFile = Join-Path $buildRoot 'compile.rsp'
[IO.File]::WriteAllLines($responseFile, $compilerArgs, (New-Object Text.UTF8Encoding($true)))
& $compiler ('@' + $responseFile)
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
$testReport = Join-Path $buildRoot 'self-test.txt'
$test = Start-Process -FilePath $executable -ArgumentList @('--self-test', ('"' + $testReport + '"')) -WindowStyle Hidden -Wait -PassThru
if ($test.ExitCode -ne 0) { Get-Content -LiteralPath $testReport; throw 'Desktop tests failed.' }
Get-Content -LiteralPath $testReport
$hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
if (-not $SkipPublish) {
    Copy-Item -LiteralPath $executable -Destination (Join-Path $downloads 'PuppyRuby.exe') -Force
    [IO.File]::WriteAllText((Join-Path $downloads 'PuppyRuby.sha256'), $hash + '  PuppyRuby.exe' + [Environment]::NewLine)
}
Write-Output ('Ready: ' + $executable)
Write-Output ('SHA256: ' + $hash)
& (Join-Path $desktopRoot 'build-setup.ps1') -SkipPublish:$SkipPublish
