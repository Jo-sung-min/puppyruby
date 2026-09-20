$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testRoot = Join-Path $projectRoot ('local-assets/desktop/update-tests/' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$executable = Join-Path $testRoot 'DesktopUpdateTests.exe'
$compilerArgs = @('/nologo', '/target:exe', '/utf8output', '/main:PuppyRubyDesktop.DesktopUpdateTests',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Net.Http.dll',
    '/reference:System.Web.Extensions.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    ('/out:"' + $executable + '"'))
foreach ($source in @('DesktopUpdate.cs', 'DesktopUpdateTest.cs', 'Setup.cs')) { $compilerArgs += '"' + (Join-Path $projectRoot ('desktop/' + $source)) + '"' }
$responseFile = Join-Path $testRoot 'compile.rsp'
[IO.File]::WriteAllLines($responseFile, $compilerArgs, (New-Object Text.UTF8Encoding($true)))
& $compiler ('@' + $responseFile)
if ($LASTEXITCODE -ne 0) { throw 'Desktop updater test compilation failed.' }
$testArgs = @((Join-Path $testRoot 'fixtures'))
$publishedManifest = Join-Path $projectRoot 'frontend/src/lib/generated/desktop-update-release.json'
if (Test-Path -LiteralPath $publishedManifest) {
    $publishedValue = Get-Content -LiteralPath $publishedManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -ne $publishedValue) { $testArgs += $publishedManifest }
}
& $executable @testArgs
if ($LASTEXITCODE -ne 0) { throw 'Desktop updater tests failed.' }
