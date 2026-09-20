param(
    [ValidateSet('Gait','Vertical','Merge','Polish','Export','All')][string]$Stage = 'All',
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe'
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$trial = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial'
$base = Join-Path $trial 'revision-2/final'
$revision = Join-Path $trial 'revision-4'
foreach ($folder in @('gait','vertical','merged','polished','final')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $revision $folder) | Out-Null
}
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
if ($Stage -in @('Gait','All')) {
    Invoke-TrialAseprite 'v4-refine-gait.lua' ([ordered]@{
        input = Join-Path $base 'akita-v4.aseprite'
        metadata = Join-Path $base 'manifest.json'
        output = Join-Path $revision 'gait'
    }) (Join-Path $revision 'gait/aseprite.log')
}
if ($Stage -in @('Vertical','All')) {
    Invoke-TrialAseprite 'akita-v4-vertical-gait.lua' ([ordered]@{
        input = Join-Path $base 'akita-v4.aseprite'
        output = Join-Path $revision 'vertical'
    }) (Join-Path $revision 'vertical/aseprite.log')
}
if ($Stage -in @('Merge','All')) {
    $metadata = Get-Content -LiteralPath (Join-Path $base 'manifest.json') -Raw | ConvertFrom-Json
    $metadata.revision = 4
    $metadata.provenance = [ordered]@{
        scope = 'Akita review only'
        base = 'User-selected Akita v4 revision 2'
        assembly = 'Native Aseprite; selected R2 anatomy preserved'
        anatomy = 'R2 side gait contact/passing correction and alternating vertical gait'
        eyes = '30 separate eye layers; frontal gait follows the preserved head with a one-pixel bob'
        outline = 'Refine connected exterior dark ink; preserve native fur and prevent double rings; no silhouette expansion'
        tool = 'Aseprite'
    }
    foreach ($id in @('walk','walk-left','walk-right','walk-up','walk-down')) {
        $metadata.actions.$id.source = 'v4-revision-2-native-gait-refinement'
    }
    $metadata.actions.'walk-down'.eyes = @(foreach ($frame in 1..4) {
        $bob = if ($frame -in @(2,4)) { -1 } else { 0 }
        ,@([ordered]@{x=65;y=(78+$bob);width=16;height=16},[ordered]@{x=96;y=(77+$bob);width=16;height=16})
    })
    [IO.File]::WriteAllText((Join-Path $revision 'merged/manifest.json'), ($metadata | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Invoke-TrialAseprite 'akita-v4-refine-merge.lua' ([ordered]@{
        input = Join-Path $base 'akita-v4.aseprite'
        gait = Join-Path $revision 'gait/v4-refine-gait.aseprite'
        vertical = Join-Path $revision 'vertical/akita-vertical.aseprite'
        output = Join-Path $revision 'merged'
    }) (Join-Path $revision 'merged/aseprite.log')
}
if ($Stage -in @('Polish','All')) {
    Invoke-TrialAseprite 'akita-v4-contour-refine.lua' ([ordered]@{
        input = Join-Path $revision 'merged/akita-v4.aseprite'
        metadata = Join-Path $revision 'merged/manifest.json'
        out = Join-Path $revision 'polished'
    }) (Join-Path $revision 'polished/aseprite.log')
}
if ($Stage -in @('Export','All')) {
    Invoke-TrialAseprite 'akita-v4-export.lua' ([ordered]@{
        input = Join-Path $revision 'polished/akita-contour-refined.aseprite'
        metadata = Join-Path $revision 'merged/manifest.json'
        output = Join-Path $revision 'final'
    }) (Join-Path $revision 'final/aseprite.log')
}
