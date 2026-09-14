param([switch]$Publish,[switch]$Reprocess,[switch]$Upgrade)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work=Join-Path $workspace 'local-assets/work/ruby-round-v1'
$sources=Get-ChildItem -LiteralPath (Join-Path $work 'originals') -File -Filter '*.png'
$failures=@();$imported=0
foreach ($source in $sources) {
    $proof=Join-Path $work ('processed/'+$source.BaseName+'/conversion.json')
    $needsUpgrade=$false
    if (Test-Path -LiteralPath $proof) {
        if ($Upgrade) { $current=Get-Content -LiteralPath $proof -Raw | ConvertFrom-Json; $needsUpgrade=$current.pipelineRevision -ne 6 }
        if (-not $Reprocess -and -not $needsUpgrade) { continue }
    }
    try { & (Join-Path $PSScriptRoot 'import-ruby-round-scenes.ps1') -Breed $source.BaseName -InputPng $source.FullName -Publish:$Publish -Reprocess:($Reprocess -or $needsUpgrade); $imported++ }
    catch { $failures += [ordered]@{breed=$source.BaseName;reason=$_.Exception.Message} }
}
if ($Publish) { & (Join-Path $PSScriptRoot 'prepare-ruby-round-scenes-manifest.ps1') }
[ordered]@{imported=$imported;failures=$failures} | ConvertTo-Json -Depth 5 -Compress
if ($failures.Count) { throw 'One or more atlases need source review; no missing scenes were fabricated.' }
