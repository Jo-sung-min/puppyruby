param(
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$Publish,
    [switch]$Reprocess
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$breedIds = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
$results = @()
foreach ($breed in $breedIds) {
    $arguments = @{ Breed=$breed; Aseprite=$Aseprite; Publish=$Publish; Reprocess=$Reprocess }
    $json = & (Join-Path $PSScriptRoot 'generate-ruby-round-actions.ps1') @arguments
    $results += ($json | ConvertFrom-Json)
}
[ordered]@{ complete=($results.Count -eq $breedIds.Count); breeds=$results.Count; actions=($results | Measure-Object actions -Sum).Sum; frames=($results | Measure-Object frames -Sum).Sum; published=[bool]$Publish } | ConvertTo-Json -Compress
