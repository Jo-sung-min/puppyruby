$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$projectRoot = Split-Path $desktopRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x compiler is required.' }

& node (Join-Path $desktopRoot 'export-assets.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Pixel sprite export failed.' }
$buildRoot = Join-Path $desktopRoot 'build'
$releaseRoot = Join-Path $desktopRoot 'dist'
$downloads = Join-Path $projectRoot 'frontend\public\downloads'
New-Item -ItemType Directory -Force -Path $releaseRoot,$downloads | Out-Null
$executable = Join-Path $releaseRoot 'PuppyRuby.exe'
$compilerArgs = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll', '/reference:System.Web.Extensions.dll', '/reference:System.Net.Http.dll', '/reference:System.Security.dll',
    ('/resource:"' + (Join-Path $projectRoot 'shared\commands.json') + '",commands.json'),
    ('/out:"' + $executable + '"'),
    ('/win32manifest:"' + (Join-Path $desktopRoot 'app.manifest') + '"'),
    ('/win32icon:"' + (Join-Path $buildRoot 'assets\puppy.ico') + '"'))
Get-ChildItem -LiteralPath (Join-Path $buildRoot 'assets') -File | Sort-Object Name | ForEach-Object {
    $compilerArgs += '/resource:"' + $_.FullName + '",' + $_.Name
}
foreach ($source in @('NativeInput.cs', 'PetState.cs', 'PetMotion.cs', 'PetMotionTest.cs', 'PetBubble.cs', 'Commands.cs', 'Progression.cs', 'AskWindow.cs', 'DesktopSync.cs', 'LinkWindow.cs', 'SyncTest.cs', 'LinkedSpriteLibrary.cs', 'Program.cs')) { $compilerArgs += '"' + (Join-Path $desktopRoot $source) + '"' }
$responseFile = Join-Path $buildRoot 'compile.rsp'
[IO.File]::WriteAllLines($responseFile, $compilerArgs, (New-Object Text.UTF8Encoding($true)))
& $compiler ('@' + $responseFile)
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
$testReport = Join-Path $buildRoot 'self-test.txt'
$test = Start-Process -FilePath $executable -ArgumentList @('--self-test', ('"' + $testReport + '"')) -WindowStyle Hidden -Wait -PassThru
if ($test.ExitCode -ne 0) { Get-Content -LiteralPath $testReport; throw 'Desktop tests failed.' }
Get-Content -LiteralPath $testReport
Copy-Item -LiteralPath $executable -Destination (Join-Path $downloads 'PuppyRuby.exe') -Force
$hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
[IO.File]::WriteAllText((Join-Path $downloads 'PuppyRuby.sha256'), $hash + '  PuppyRuby.exe' + [Environment]::NewLine)
Write-Output ('Ready: ' + $executable)
Write-Output ('SHA256: ' + $hash)
