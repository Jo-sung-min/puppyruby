param(
    [ValidateSet('Import','Polish','Export','All')][string]$Stage = 'All',
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe'
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$trial = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial'
$revision = Join-Path $trial 'revision-2'
$baseline = if (Test-Path -LiteralPath (Join-Path $trial 'revision-1/akita-v4.aseprite')) { Join-Path $trial 'revision-1' } else { Join-Path $trial 'final' }
function Invoke-TrialAseprite([string]$Script, [System.Collections.IDictionary]$Parameters, [string]$Log) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.ArgumentList.Add('--batch')
    foreach ($key in $Parameters.Keys) { $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key + '=' + $Parameters[$key]) }
    $start.ArgumentList.Add('--script'); $start.ArgumentList.Add((Join-Path $PSScriptRoot ('aseprite/' + $Script)))
    $process = [Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $result = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    $code = $process.ExitCode; $process.Dispose()
    [IO.File]::WriteAllText($Log, $result)
    if ($code -ne 0 -or $result -match '(?i)error|stack traceback') { throw $result }
    Write-Output $result
}
foreach ($folder in @('redrawn','polished','final')) { New-Item -ItemType Directory -Force -Path (Join-Path $revision $folder) | Out-Null }
if ($Stage -in @('Import','All')) {
    Invoke-TrialAseprite 'akita-v4-revise.lua' ([ordered]@{
        master = Join-Path $baseline 'akita-v4.aseprite'
        metadata = Join-Path $baseline 'manifest.json'
        walk = Join-Path $revision 'source/walk-four-paws-refined.png'
        happy = Join-Path $revision 'source/happy-four-paws.png'
        eyes = Join-Path $workspace 'local-assets/work/ruby-round-v3/eyes'
        output = Join-Path $revision 'redrawn'
    }) (Join-Path $revision 'redrawn/aseprite.log')
}
if ($Stage -in @('Polish','All')) {
    Invoke-TrialAseprite 'akita-v4-edge-polish.lua' ([ordered]@{
        input = Join-Path $revision 'redrawn/akita-v4.aseprite'
        metadata = Join-Path $revision 'redrawn/manifest.json'
        out = Join-Path $revision 'polished'
    }) (Join-Path $revision 'polished/aseprite.log')
}
if ($Stage -in @('Export','All')) {
    Invoke-TrialAseprite 'akita-v4-export.lua' ([ordered]@{
        input = Join-Path $revision 'polished/akita-edge-polished.aseprite'
        metadata = Join-Path $revision 'redrawn/manifest.json'
        output = Join-Path $revision 'final'
    }) (Join-Path $revision 'final/aseprite.log')
}
