param(
    [ValidateSet('sp08','sp15','all')][string]$Style = 'all',
    [ValidateSet('transparent','border-white','border-magenta')][string]$Background = 'border-magenta',
    [switch]$Publish,
    [switch]$Complete
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = [IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts'))
$breedIds = @([regex]::Matches($catalog, 'id: "([a-z]+)"') | ForEach-Object {$_.Groups[1].Value})
$styles = if ($Style -eq 'all') { @('sp08','sp15') } else { @($Style) }
$imported = @(); $existing = @(); $pending = @(); $failed = @()
foreach ($styleId in $styles) { foreach ($breed in $breedIds) {
    $source = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$styleId+'/originals/'+$breed+'.png')
    $proof = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$styleId+'/processed/'+$breed+'/conversion.json')
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $pending += ($styleId+'/'+$breed); continue }
    try {
        if (Test-Path -LiteralPath $proof -PathType Leaf) {
            & (Join-Path $PSScriptRoot 'import-sp-scenes.ps1') -Style $styleId -Breed $breed -InputPng $source -Background $Background -Publish:$Publish -VerifyExisting
            $existing += ($styleId+'/'+$breed)
        } else {
            & (Join-Path $PSScriptRoot 'import-sp-scenes.ps1') -Style $styleId -Breed $breed -InputPng $source -Background $Background -Publish:$Publish
            $imported += ($styleId+'/'+$breed)
        }
    } catch { $failed += @{set=($styleId+'/'+$breed);error=$_.Exception.Message} }
} }
if ($Publish) { & (Join-Path $PSScriptRoot 'prepare-sp-scenes-manifest.ps1') -Complete:$Complete -Package:$Complete }
if ($Complete -and -not $Publish) { throw 'Complete registration requires published verified files.' }
[ordered]@{imported=$imported;verifiedExisting=$existing;pending=$pending;failed=$failed;complete=($pending.Count -eq 0 -and $failed.Count -eq 0)} | ConvertTo-Json -Depth 4 -Compress
if ($failed.Count -gt 0) { exit 1 }
