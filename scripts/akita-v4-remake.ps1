param([ValidateSet('Import','Polish','Export','All')][string]$Stage = 'All', [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$trial = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial'
$revision = Join-Path $trial 'revision-3'
$baseline = Join-Path $trial 'revision-2/final'
function Invoke-RemakeAseprite([string]$Script, [System.Collections.IDictionary]$Parameters, [string]$Log) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.ArgumentList.Add('--batch')
    foreach ($key in $Parameters.Keys) { $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key + '=' + $Parameters[$key]) }
    $start.ArgumentList.Add('--script'); $start.ArgumentList.Add((Join-Path $PSScriptRoot ('aseprite/' + $Script)))
    $process = [Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit(); $result = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    $code = $process.ExitCode; $process.Dispose(); [IO.File]::WriteAllText($Log, $result)
    if ($code -ne 0 -or $result -match '(?i)error|stack traceback') { throw $result }
    Write-Output $result
}
foreach ($folder in @('redrawn','polished','final')) { New-Item -ItemType Directory -Force -Path (Join-Path $revision $folder) | Out-Null }
if ($Stage -in @('Import','All')) {
    $config = [ordered]@{ atlases = @(); actions = @() }
    foreach ($part in @('core-misc','rest','locomotion')) {
        $fragment = Get-Content -LiteralPath (Join-Path $revision ('source/config-' + $part + '.json')) -Raw | ConvertFrom-Json
        $config.atlases += $fragment.atlases; $config.actions += $fragment.actions
    }
    if ($config.actions.Count -ne 14) { throw 'Exactly fourteen drawn action rows are required; walk alias and right mirror complete sixteen.' }
    [IO.File]::WriteAllText((Join-Path $revision 'source/import-config.json'), ($config | ConvertTo-Json -Depth 24), [Text.UTF8Encoding]::new($false))
    Invoke-RemakeAseprite 'akita-v4-remake.lua' ([ordered]@{
        config = Join-Path $revision 'source/import-config.json'; root = Join-Path $revision 'source'
        master = Join-Path $baseline 'akita-v4.aseprite'; metadata = Join-Path $baseline 'manifest.json'
        eyes = Join-Path $workspace 'local-assets/work/ruby-round-v3/eyes'; output = Join-Path $revision 'redrawn'
    }) (Join-Path $revision 'redrawn/aseprite.log')
}
if ($Stage -in @('Polish','All')) {
    Invoke-RemakeAseprite 'akita-v4-edge-polish.lua' ([ordered]@{
        input = Join-Path $revision 'redrawn/akita-v4.aseprite'; metadata = Join-Path $revision 'redrawn/manifest.json'; out = Join-Path $revision 'polished'
    }) (Join-Path $revision 'polished/aseprite.log')
}
if ($Stage -in @('Export','All')) {
    Invoke-RemakeAseprite 'akita-v4-export.lua' ([ordered]@{
        input = Join-Path $revision 'polished/akita-edge-polished.aseprite'; metadata = Join-Path $revision 'redrawn/manifest.json'; output = Join-Path $revision 'final'
    }) (Join-Path $revision 'final/aseprite.log')
}
