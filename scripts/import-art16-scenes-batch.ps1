param(
    [ValidateSet('transparent','border-white','border-magenta')][string]$Background = 'border-magenta',
    [switch]$Publish,
    [switch]$Complete
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = [IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts'))
$breedIds = @([regex]::Matches($catalog, 'id: "([a-z]+)"') | ForEach-Object {$_.Groups[1].Value})
$imported = @(); $existing = @(); $pending = @()
foreach ($breed in $breedIds) {
    $source = Join-Path $workspace ('local-assets/work/art16-scenes-v1/raw/'+$breed+'.png')
    $proof = Join-Path $workspace ('local-assets/work/art16-scenes-v1/processed/'+$breed+'/conversion.json')
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $pending += $breed; continue }
    if (Test-Path -LiteralPath $proof -PathType Leaf) {
        & (Join-Path $PSScriptRoot 'import-art16-scenes.ps1') -Breed $breed -InputPng $source -Background $Background -Publish:$Publish -VerifyExisting
        $existing += $breed
    } else {
        & (Join-Path $PSScriptRoot 'import-art16-scenes.ps1') -Breed $breed -InputPng $source -Background $Background -Publish:$Publish
        $imported += $breed
    }
}
if ($Complete) {
    if (-not $Publish) { throw 'Complete registration requires published verified files.' }
    if ($pending.Count -gt 0) { throw ('Generation remains incomplete: '+($pending -join ', ')) }
    & (Join-Path $PSScriptRoot 'prepare-art16-scenes-manifest.ps1') -Package
}
[ordered]@{imported=$imported;verifiedExisting=$existing;pending=$pending;complete=($pending.Count -eq 0)} | ConvertTo-Json -Depth 3 -Compress
