param([string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$trial = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial'
$output = Join-Path $trial 'final'
$parameters = [ordered]@{
    input = Join-Path $trial 'source/walk-left-corrected.png'
    master = Join-Path $trial 'cleaned/akita-cleaned.aseprite'
    manifest = Join-Path $trial 'cleaned/manifest.json'
    eyes = Join-Path $workspace 'local-assets/work/ruby-round-v3/eyes'
    output = $output
}
foreach ($name in @('input','master','manifest')) {
    if (-not (Test-Path -LiteralPath $parameters[$name] -PathType Leaf)) { throw ('Missing reviewed input: ' + $name) }
}
New-Item -ItemType Directory -Force -Path $output | Out-Null
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $Aseprite
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.ArgumentList.Add('--batch')
foreach ($key in $parameters.Keys) {
    $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key + '=' + $parameters[$key])
}
$start.ArgumentList.Add('--script')
$start.ArgumentList.Add((Join-Path $PSScriptRoot 'aseprite/akita-v4-walk.lua'))
$process = [Diagnostics.Process]::Start($start)
$stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$text = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
$code = $process.ExitCode; $process.Dispose()
[IO.File]::WriteAllText((Join-Path $output 'aseprite-walk.log'), $text)
if ($code -ne 0 -or $text -match '(?i)error|stack traceback') { throw $text }
$audit = Get-Content -LiteralPath (Join-Path $output 'walk-import-audit.json') -Raw | ConvertFrom-Json
if ($audit.partialAlphaPixels -ne 0 -or $audit.totalFrames -ne 64 -or $audit.editableLayers -ne 31) { throw 'Trial master verification failed.' }
$hashes = [ordered]@{}
Get-ChildItem -LiteralPath $output -File | Where-Object Extension -in @('.png','.gif','.aseprite') | ForEach-Object {
    $hashes[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText((Join-Path $output 'sha256.json'), ($hashes | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Write-Output $text
Write-Output ('Akita trial only: ' + (Join-Path $output 'akita-v4.aseprite'))
