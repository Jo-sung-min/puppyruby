param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial/cleaned' }
$source = Get-Content -LiteralPath (Join-Path $workspace 'local-assets/work/ruby-round-v3/processed/akita/motion-conversion.json') -Raw | ConvertFrom-Json
$audit = Get-Content -LiteralPath (Join-Path $OutputDirectory 'cleanup-audit.json') -Raw | ConvertFrom-Json
if ($source.breed -ne 'akita' -or $source.frames -ne 64 -or -not $audit.savedMasterVerified -or -not $audit.sharedEyeLayersPreservedExceptFrame38) { throw 'Verified Akita cleanup is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $OutputDirectory 'akita-cleaned.aseprite') -PathType Leaf)) { throw 'Clean master missing.' }
$actions = [ordered]@{}
foreach ($name in $source.actionOrder) {
    $action = $source.actions.$name
    if ($action.frames -ne 4 -or $action.eyes.Count -ne 4 -or $action.eyeModeByFrame.Count -ne 4) { throw ('Incomplete source action: ' + $name) }
    $action.png = $name + '.png'
    $actions[$name] = $action
}
$actions['stretch'].eyeModeByFrame[1] = 'baked-closed'
$actions['stretch'].eyes[1] = @()
$manifest = [ordered]@{
    version=4; stage='akita-trial-cleaned'; breed='akita'; width=$source.width; height=$source.height
    frames=64; framesPerAction=4; editableLayers=31; eyeStyles=30
    actions=$actions; actionOrder=@($source.actionOrder); master='akita-cleaned.aseprite'
    provenance='Existing v3 native art cleaned in Aseprite; no pose redrawing or asset replacement at this stage.'
    alpha='binary'; eyeModeCorrection=[ordered]@{frame=38;mode='baked-closed'}
}
$path = Join-Path $OutputDirectory 'manifest.json'
[IO.File]::WriteAllText($path,($manifest | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
$verified = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
if ($verified.actionOrder.Count -ne 16 -or @($verified.actions.PSObject.Properties).Count -ne 16 -or $verified.actions.stretch.eyes[1].Count -ne 0) { throw 'Manifest round-trip failed.' }
Write-Output ('Verified native 16-action metadata: ' + $path)
