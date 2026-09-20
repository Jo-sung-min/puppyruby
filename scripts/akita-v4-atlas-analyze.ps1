param(
    [string]$Source = 'local-assets/work/ruby-round-v4/akita-trial/revision-3/source/core-atlas.png',
    [ValidateSet(2,4)][int]$Rows = 4,
    [string]$RowCuts = '',
    [string]$OutputDirectory = '',
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe'
)
$ErrorActionPreference = 'Stop'
$atlasWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$atlasBoundary = [IO.Path]::GetFullPath((Join-Path $atlasWorkspace 'local-assets/work/ruby-round-v4/akita-trial'))
$atlasSource = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($Source)) { $Source } else { Join-Path $atlasWorkspace $Source }))
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path (Split-Path $atlasSource -Parent) -Parent) ('analysis/' + [IO.Path]::GetFileNameWithoutExtension($atlasSource))
}
$atlasOutput = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $atlasWorkspace $OutputDirectory }))
foreach ($atlasPath in @($atlasSource,$atlasOutput)) {
    if (-not $atlasPath.StartsWith($atlasBoundary + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Analysis paths must stay inside the isolated Akita trial.' }
    for ($atlasCheck = $atlasPath; $atlasCheck.Length -ge $atlasBoundary.Length; $atlasCheck = [IO.Path]::GetDirectoryName($atlasCheck)) {
        if (Test-Path -LiteralPath $atlasCheck) {
            if ((Get-Item -LiteralPath $atlasCheck -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Analysis paths cannot use symbolic links or junctions.' }
        }
        if ($atlasCheck.Equals($atlasBoundary,[StringComparison]::OrdinalIgnoreCase)) { break }
    }
}
foreach ($atlasProtected in @('final','review','source')) {
    $atlasProtectedPath = Join-Path $atlasBoundary $atlasProtected
    if ($atlasOutput.Equals($atlasProtectedPath,[StringComparison]::OrdinalIgnoreCase) -or $atlasOutput.StartsWith($atlasProtectedPath + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Analysis cannot overwrite final, review or source folders.' }
}
if ($atlasOutput.Equals((Split-Path $atlasSource -Parent),[StringComparison]::OrdinalIgnoreCase)) { throw 'Use a separate analysis folder.' }
$atlasScript = Join-Path $PSScriptRoot 'aseprite/akita-v4-atlas-analyze.lua'
foreach ($atlasRequired in @($atlasSource,$atlasScript,$Aseprite)) { if (-not (Test-Path -LiteralPath $atlasRequired -PathType Leaf)) { throw ('Missing analysis input: ' + $atlasRequired) } }
[IO.Directory]::CreateDirectory($atlasOutput) | Out-Null
$atlasSourceHash = (Get-FileHash -LiteralPath $atlasSource -Algorithm SHA256).Hash.ToLowerInvariant()
$atlasStart = [Diagnostics.ProcessStartInfo]::new()
$atlasStart.FileName = $Aseprite; $atlasStart.UseShellExecute = $false; $atlasStart.CreateNoWindow = $true
$atlasStart.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$atlasStart.RedirectStandardOutput = $true; $atlasStart.RedirectStandardError = $true
$atlasStart.ArgumentList.Add('--batch')
foreach ($atlasParameter in @("input=$atlasSource","rows=$Rows","output=$atlasOutput")) { $atlasStart.ArgumentList.Add('--script-param'); $atlasStart.ArgumentList.Add($atlasParameter) }
if ($RowCuts) {
    if ($RowCuts -notmatch '^\d+(,\d+)*$' -or ($RowCuts.Split(',').Count -ne $Rows-1)) { throw 'RowCuts must contain rows-1 comma-separated source Y coordinates.' }
    $atlasStart.ArgumentList.Add('--script-param'); $atlasStart.ArgumentList.Add('rowCuts=' + $RowCuts)
}
$atlasStart.ArgumentList.Add('--script'); $atlasStart.ArgumentList.Add($atlasScript)
$atlasProcess = [Diagnostics.Process]::Start($atlasStart)
$atlasStdout = $atlasProcess.StandardOutput.ReadToEndAsync(); $atlasStderr = $atlasProcess.StandardError.ReadToEndAsync()
$atlasProcess.WaitForExit()
$atlasText = $atlasStdout.GetAwaiter().GetResult() + $atlasStderr.GetAwaiter().GetResult()
$atlasCode = $atlasProcess.ExitCode; $atlasProcess.Dispose()
[IO.File]::WriteAllText((Join-Path $atlasOutput 'aseprite-analysis.log'),$atlasText,[Text.UTF8Encoding]::new($false))
if ($atlasCode -ne 0 -or $atlasText -match '(?i)error|stack traceback') { throw ('Aseprite analysis failed: ' + $atlasText) }
if ($atlasSourceHash -ne (Get-FileHash -LiteralPath $atlasSource -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Source atlas changed during analysis.' }
$atlasReport = Get-Content -LiteralPath (Join-Path $atlasOutput 'atlas-analysis.json') -Raw | ConvertFrom-Json
if ($atlasReport.cells.Count -ne 4*$Rows -or $atlasReport.nativeWidth -ne 179 -or $atlasReport.nativeHeight -ne 188) { throw 'Atlas analysis contract failed.' }
$atlasProof = [ordered]@{source=$atlasSource;sha256=$atlasSourceHash;sourceUnchanged=$true;rows=$Rows;columns=4;report='atlas-analysis.json';contact='native-body-contact.png'}
[IO.File]::WriteAllText((Join-Path $atlasOutput 'source-integrity.json'),($atlasProof | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
Write-Output $atlasText
Write-Output ('Report: ' + (Join-Path $atlasOutput 'atlas-analysis.json'))
Write-Output ('Native contact: ' + (Join-Path $atlasOutput 'native-body-contact.png'))
