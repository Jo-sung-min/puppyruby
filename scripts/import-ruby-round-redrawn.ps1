param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed,
    [string]$InputPng,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [ValidateSet('transparent','border-magenta','transparent-artifacts')][string]$Background = 'border-magenta',
    [ValidateRange(1,48)][int]$FringeAlphaMax = 8,
    [string]$FringeReviewReason,
    [string]$Anchors,
    [switch]$Publish,
    [switch]$VerifyExisting,
    [switch]$Reprocess
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$breedIds = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
if ($breedIds -notcontains $Breed) { throw 'Unknown registered breed.' }
$actionIds = @('idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down')
$work = Join-Path $workspace 'local-assets/work/ruby-round-v3'
if (-not $InputPng) { $InputPng = Join-Path $work ('originals/' + $Breed + '.png') }
$source = [IO.Path]::GetFullPath($InputPng)
$destination = Join-Path $work ('processed/' + $Breed)
$eyes = Join-Path $work 'eyes'
$utf8 = [Text.UTF8Encoding]::new($false)
if (-not (Test-Path -LiteralPath $Aseprite -PathType Leaf)) { throw 'Aseprite executable not found.' }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Independently redrawn source atlas not found.' }
if ($Reprocess -and $VerifyExisting) { throw 'Reprocess and VerifyExisting cannot be combined.' }
if (-not $VerifyExisting -and $FringeAlphaMax -gt 8 -and [string]::IsNullOrWhiteSpace($FringeReviewReason)) { throw 'An increased alpha-fringe limit requires a source-specific review reason.' }
function Get-Sha256([string]$Path) {
    $digest = Get-FileHash -LiteralPath $Path -Algorithm SHA256
    if ([string]::IsNullOrWhiteSpace($digest.Hash)) { throw ('SHA256 missing: ' + $Path) }
    return $digest.Hash.ToLowerInvariant()
}
$sourceHash = Get-Sha256 $source
$importerHash = Get-Sha256 (Join-Path $PSScriptRoot 'aseprite/import-ruby-round-redrawn.lua')
$assemblyPath = [IO.Path]::ChangeExtension($source,'assembly.json')
$assemblyHash = $null
if (Test-Path -LiteralPath $assemblyPath -PathType Leaf) {
    $assembly = Get-Content -LiteralPath $assemblyPath -Raw | ConvertFrom-Json
    if ($assembly.finalSha256 -ne $sourceHash -or $assembly.resized -ne $false -or $assembly.rotated -ne $false -or -not $assembly.correctedFrames.Count) { throw 'Source assembly audit does not match the supplied atlas.' }
    foreach ($number in $assembly.correctedFrames) { if ($number -lt 1 -or $number -gt 64) { throw 'Source assembly has an invalid frame index.' } }
    $assemblyHash = Get-Sha256 $assemblyPath
}
if ($Anchors) {
    $Anchors = [IO.Path]::GetFullPath($Anchors)
    $anchorData = Get-Content -LiteralPath $Anchors -Raw | ConvertFrom-Json
    if (-not $anchorData.sourceSha256 -or $anchorData.sourceSha256 -ne $sourceHash) { throw 'Manual eye anchors must declare the matching sourceSha256.' }
}
if ($Reprocess -and (Test-Path -LiteralPath $destination)) {
    $backup = [IO.Path]::GetFullPath((Join-Path $work ('backups/' + $Breed + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))))
    $resolvedDestination = [IO.Path]::GetFullPath($destination)
    $boundary = [IO.Path]::GetFullPath($work).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedDestination.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -or -not $backup.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Reprocessing paths must remain within ruby-round-v3.' }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $backup)) | Out-Null
    Move-Item -LiteralPath $resolvedDestination -Destination $backup
}
[IO.Directory]::CreateDirectory($destination) | Out-Null
function Invoke-Aseprite([string]$Script, [hashtable]$Parameters) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.ArgumentList.Add('--batch')
    foreach ($key in $Parameters.Keys) { $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key + '=' + $Parameters[$key]) }
    $start.ArgumentList.Add('--script'); $start.ArgumentList.Add((Join-Path $PSScriptRoot ('aseprite/' + $Script)))
    $process = [Diagnostics.Process]::Start($start)
    if ($null -eq $process) { throw 'Aseprite process could not be started.' }
    $outTask = $process.StandardOutput.ReadToEndAsync(); $errTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit(); $outText = $outTask.GetAwaiter().GetResult(); $errText = $errTask.GetAwaiter().GetResult(); $code = $process.ExitCode
    $process.Dispose()
    $log = Join-Path $destination ($Script + '.log')
    [IO.File]::WriteAllText($log,$outText + $errText,$utf8)
    if ($code -ne 0 -or $errText -match '(?i)error|stack traceback') { throw ('Aseprite import failed; inspect ' + $log) }
}
$proofPath = Join-Path $destination 'motion-conversion.json'
$legacyProofPath = Join-Path $destination 'conversion.json'
if (-not $VerifyExisting) {
    if ((Test-Path -LiteralPath $proofPath) -or (Test-Path -LiteralPath $legacyProofPath)) { throw 'Existing redrawn output is preserved. Use -Reprocess to move it to a timestamped v3 backup.' }
    [IO.Directory]::CreateDirectory($eyes) | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $eyes 'manifest.json'))) { Invoke-Aseprite 'create-ruby-round-eyes.lua' @{ output=$eyes } }
    foreach ($n in 1..30) {
        if (-not (Test-Path -LiteralPath (Join-Path $eyes ('eye-{0:d2}.png' -f $n)) -PathType Leaf)) { throw 'The shared editable eye set is incomplete.' }
    }
    $copiedSource = Join-Path $destination 'source-input.png'
    if ($source -ne [IO.Path]::GetFullPath($copiedSource)) { Copy-Item -LiteralPath $source -Destination $copiedSource }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'aseprite/import-ruby-round-redrawn.lua') -Destination (Join-Path $destination 'importer-source.lua')
    $parameters = @{ input=$copiedSource; output=$destination; id=$Breed; eyes=$eyes; background=$Background; fringeAlphaMax=$FringeAlphaMax; sourceSha256=$sourceHash; spec=(Join-Path $workspace 'shared/ruby-round-actions.json') }
    if ($Anchors) {
        $copiedAnchors = Join-Path $destination 'eye-anchors.json'
        Copy-Item -LiteralPath $Anchors -Destination $copiedAnchors
        $parameters.anchors = $copiedAnchors
    }
    Invoke-Aseprite 'import-ruby-round-redrawn.lua' $parameters
}
foreach ($required in @($proofPath,$legacyProofPath,(Join-Path $destination 'source-input.png'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Conversion output missing: ' + $required) }
}
if ((Get-Sha256 (Join-Path $destination 'source-input.png')) -ne $sourceHash) { throw 'Archived source atlas differs from the supplied original.' }
$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
$legacy = Get-Content -LiteralPath $legacyProofPath -Raw | ConvertFrom-Json
foreach ($record in @($proof,$legacy)) {
    if ($record.breed -ne $Breed -or $record.version -ne 3 -or $record.framesPerAction -ne 4 -or $record.eyeStyles -ne 30 -or $record.editableLayers -ne 31 -or $record.sourceSha256 -ne $sourceHash -or $record.sourceKind -ne 'independently-redrawn-64-frame-atlas' -or $record.resized -or $record.quantized -or $record.fabricatedFrames -or $record.derivedFromOldPoses -or $record.mirroredFrames -or $record.rotatedFrames -or -not $record.retainedArtworkRgbaUnchanged -or -not $record.editableRgbaVerified -or $record.cellRectangles.Count -ne 64) { throw 'Incomplete redrawn source conversion proof.' }
    if (($record.actionOrder -join '|') -ne ($actionIds -join '|')) { throw 'Action order differs from the 16-action contract.' }
    if ($VerifyExisting -and $record.importerSource) {
        if ($record.importerSource -ne 'importer-source.lua' -or (Get-Sha256 (Join-Path $destination 'importer-source.lua')) -ne $record.importerSha256) { throw 'Archived importer snapshot differs from the recorded conversion implementation.' }
    }
    if ($record.eyeAnchorsSha256 -and (Get-Sha256 (Join-Path $destination 'eye-anchors.json')) -ne $record.eyeAnchorsSha256) { throw 'Archived reviewed eye or source-cell settings changed after import.' }
    if ($VerifyExisting -and $Anchors -and (Get-Sha256 $Anchors) -ne $record.eyeAnchorsSha256) { throw 'Reviewed eye or source-cell settings changed; reprocess before attaching the new settings.' }
    if ($record.sourceAssemblySha256 -and ($record.sourceAssembly -ne 'source-assembly.json' -or (Get-Sha256 (Join-Path $destination 'source-assembly.json')) -ne $record.sourceAssemblySha256)) { throw 'Archived source assembly audit changed after import.' }
    if ($record.fringeAlphaMax -lt 1 -or $record.fringeAlphaMax -gt 48) { throw 'Missing or invalid reviewed alpha-fringe limit.' }
    if ($VerifyExisting -and $PSBoundParameters.ContainsKey('FringeAlphaMax') -and $record.fringeAlphaMax -ne $FringeAlphaMax) { throw 'Requested fringe limit differs from the recorded source conversion.' }
    if ($VerifyExisting -and $PSBoundParameters.ContainsKey('Background') -and $record.backgroundMode -ne $Background) { throw 'Requested background mode differs from the recorded source conversion.' }
}
if ($proof.frames -ne 64 -or $legacy.frames -ne 20) { throw 'Incorrect full or compatibility master frame count.' }
$hashes = [ordered]@{}
foreach ($action in $actionIds) {
    $motion = $proof.actions.$action
    if ($null -eq $motion -or $motion.frames -ne 4 -or $motion.eyes.Count -ne 4 -or $motion.eyeModeByFrame.Count -ne 4 -or $motion.kind -ne 'redrawn') { throw ('Incomplete action record: ' + $action) }
    $hashes[$action] = Get-Sha256 (Join-Path $destination ($action + '.png'))
    if ($VerifyExisting -and $proof.pngSha256 -and $proof.pngSha256.$action -ne $hashes[$action]) { throw ('Changed action sheet: ' + $action) }
    if ($actionIds.IndexOf($action) -lt 5) {
        foreach ($suffix in @('-default','-desktop')) {
            $key = $action + $suffix
            $hashes[$key] = Get-Sha256 (Join-Path $destination ($key + '.png'))
            if ($VerifyExisting -and $proof.pngSha256 -and $proof.pngSha256.$key -ne $hashes[$key]) { throw ('Changed compatibility sheet: ' + $key) }
        }
    }
}
$master = Join-Path $destination ($Breed + '-16-actions.aseprite')
$legacyMaster = Join-Path $destination ($Breed + '.aseprite')
$masterHash = Get-Sha256 $master
$legacyHash = Get-Sha256 $legacyMaster
if ($VerifyExisting -and (($proof.asepriteSha256 -and $proof.asepriteSha256 -ne $masterHash) -or ($legacy.asepriteSha256 -and $legacy.asepriteSha256 -ne $legacyHash))) { throw 'Editable master changed after import.' }
foreach ($record in @($proof,$legacy)) {
    $record | Add-Member -NotePropertyName pngSha256 -NotePropertyValue $hashes -Force
    $record | Add-Member -NotePropertyName originalSourcePath -NotePropertyValue $source -Force
    if (-not $VerifyExisting) {
        $record | Add-Member -NotePropertyName importerSha256 -NotePropertyValue $importerHash -Force
        $record | Add-Member -NotePropertyName importerSource -NotePropertyValue 'importer-source.lua' -Force
    }
    if ($assemblyHash) {
        if ($record.sourceAssemblySha256 -and $record.sourceAssemblySha256 -ne $assemblyHash) { throw 'Source assembly audit changed after conversion.' }
        Copy-Item -LiteralPath $assemblyPath -Destination (Join-Path $destination 'source-assembly.json') -Force
        $record | Add-Member -NotePropertyName sourceAssembly -NotePropertyValue 'source-assembly.json' -Force
        $record | Add-Member -NotePropertyName sourceAssemblySha256 -NotePropertyValue $assemblyHash -Force
    }
    if (-not $VerifyExisting) {
        $reason = if ($FringeReviewReason) { $FringeReviewReason } else { 'Default cleanup of alpha <=8 mask noise connected to transparency; opaque artwork is retained.' }
        $record | Add-Member -NotePropertyName reviewedFringeCleanup -NotePropertyValue ([ordered]@{alphaMax=$FringeAlphaMax;reason=$reason;sourceSha256=$sourceHash;connectivity=8}) -Force
    }
    if ($Anchors -and -not $VerifyExisting) { $record | Add-Member -NotePropertyName eyeAnchorsSha256 -NotePropertyValue (Get-Sha256 (Join-Path $destination 'eye-anchors.json')) -Force }
}
$proof | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue $masterHash -Force
$proof | Add-Member -NotePropertyName legacyAsepriteSha256 -NotePropertyValue $legacyHash -Force
$proof | Add-Member -NotePropertyName compatibilityAsepriteSha256 -NotePropertyValue $legacyHash -Force
$legacy | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue $legacyHash -Force
$legacy | Add-Member -NotePropertyName motionAsepriteSha256 -NotePropertyValue $masterHash -Force
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json -Depth 30),$utf8)
[IO.File]::WriteAllText($legacyProofPath,($legacy | ConvertTo-Json -Depth 30),$utf8)
if ($Publish) {
    # Publish means local staging only. A separate approved flow handles hosting.
    $images = Join-Path $workspace ('local-assets/site/images/ruby-round-v1/' + $Breed)
    $actions = Join-Path $images 'actions'
    $downloads = Join-Path $workspace 'local-assets/site/downloads/ruby-round-v1'
    $publicEyes = Join-Path $workspace 'local-assets/site/images/ruby-round-v1/eyes'
    foreach ($folder in @($images,$actions,$downloads,$publicEyes)) { [IO.Directory]::CreateDirectory($folder) | Out-Null }
    foreach ($action in $actionIds) {
        if ($actionIds.IndexOf($action) -lt 5) {
            foreach ($suffix in @('','-default','-desktop')) { Copy-Item -LiteralPath (Join-Path $destination ($action + $suffix + '.png')) -Destination (Join-Path $images ($action + $suffix + '.png')) -Force }
        } else { Copy-Item -LiteralPath (Join-Path $destination ($action + '.png')) -Destination (Join-Path $actions ($action + '.png')) -Force }
    }
    Copy-Item -LiteralPath $master -Destination (Join-Path $downloads ($Breed + '-16-actions.aseprite')) -Force
    Copy-Item -LiteralPath $legacyMaster -Destination (Join-Path $downloads ($Breed + '.aseprite')) -Force
    foreach ($eyeFile in Get-ChildItem -LiteralPath $eyes -File -Filter '*.png') { Copy-Item -LiteralPath $eyeFile.FullName -Destination (Join-Path $publicEyes $eyeFile.Name) -Force }
    Copy-Item -LiteralPath (Join-Path $eyes 'manifest.json') -Destination (Join-Path $publicEyes 'manifest.json') -Force
    Copy-Item -LiteralPath (Join-Path $eyes 'ruby-round-eyes.aseprite') -Destination (Join-Path $downloads 'ruby-round-eyes.aseprite') -Force
}
[ordered]@{ breed=$Breed; actions=16; frames=64; eyeStyles=30; editableLayers=31; width=$proof.width; height=$proof.height; staged=[bool]$Publish; sourceSha256=$sourceHash; sourceKind=$proof.sourceKind } | ConvertTo-Json -Compress
