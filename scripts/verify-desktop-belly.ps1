param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$desktopRoot = Join-Path $projectRoot 'desktop'
$testRoot = Join-Path $projectRoot ('local-assets\work\desktop-belly\run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$executable = Join-Path $testRoot 'BellyReactionTest.exe'
$arguments = @('/nologo', '/target:exe', '/platform:anycpu', '/optimize+', '/utf8output', '/main:PuppyRubyDesktop.BellyReactionTest',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Net.Http.dll', '/reference:System.Web.Extensions.dll', '/reference:System.Security.dll',
    ('/out:"' + $executable + '"'),
    ('/resource:"' + (Join-Path $projectRoot 'local-assets/desktop/build/ruby-assets/breed-catalog.json') + '",breed-catalog.json'),
    ('/resource:"' + (Join-Path $projectRoot 'shared\art16-reaction-anchors.json') + '",art16-reaction-anchors.json'))
foreach ($source in @('BellyReactionTest.cs', 'DesktopAppearanceCache.cs', 'DesktopAppearanceFrames.cs', 'DesktopAccessoryRenderer.cs', 'DesktopAppearanceReactions.cs', 'DesktopBreedCatalog.cs', 'DesktopSync.cs', 'Progression.cs', 'PetState.cs', 'NativeInput.cs')) {
    $arguments += '"' + (Join-Path $desktopRoot $source) + '"'
}
$responseFile = Join-Path $testRoot 'compile.rsp'
[IO.File]::WriteAllLines($responseFile, $arguments, (New-Object Text.UTF8Encoding($true)))
& $compiler ('@' + $responseFile)
if ($LASTEXITCODE -ne 0) { throw 'Desktop belly-test compilation failed.' }
& $executable $projectRoot $testRoot
if ($LASTEXITCODE -ne 0) { throw ('Desktop belly tests failed. See ' + (Join-Path $testRoot 'report.json')) }
Write-Output ('Report: ' + (Join-Path $testRoot 'report.json'))
