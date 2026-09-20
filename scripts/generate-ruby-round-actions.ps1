param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$Publish,
    [switch]$Reprocess
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$registered = Join-Path $workspace 'frontend/src/lib/generated/ruby-round-scene-assets.json'
if ($Publish -and (Test-Path -LiteralPath $registered)) {
    $current = Get-Content -LiteralPath $registered -Raw | ConvertFrom-Json
    if (@($current | Where-Object { $_.assetVersion -eq 3 }).Count -gt 0) {
        throw 'Legacy transformed poses cannot replace the redrawn artwork. Use import-ruby-round-redrawn.ps1 and its verified v3 source atlases.'
    }
}
$breedIds = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
if ($breedIds -notcontains $Breed) { throw 'Unknown registered breed.' }
if (-not (Test-Path -LiteralPath $Aseprite -PathType Leaf)) { throw 'Paid Aseprite executable not found.' }
$sourceDir = Join-Path $workspace ('local-assets/work/ruby-round-v1/processed/' + $Breed)
$sourceMaster = Join-Path $sourceDir ($Breed + '.aseprite')
$sourceProof = Join-Path $sourceDir 'conversion.json'
$eyes = Join-Path $workspace 'local-assets/work/ruby-round-v1/eyes'
$spec = Join-Path $workspace 'shared/ruby-round-actions.json'
$destination = Join-Path $workspace ('local-assets/work/ruby-round-v2/processed/' + $Breed)
foreach ($required in @($sourceMaster,$sourceProof,$spec,(Join-Path $eyes 'manifest.json'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Required verified source is missing: ' + $required) }
}
if ($Reprocess -and (Test-Path -LiteralPath $destination)) {
    $backup = Join-Path $workspace ('local-assets/work/ruby-round-v2/backups/' + $Breed + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
    $resolvedDestination = [IO.Path]::GetFullPath($destination)
    $resolvedBackup = [IO.Path]::GetFullPath($backup)
    $boundary = $workspace.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedDestination.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -or -not $resolvedBackup.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Action processing paths must remain in the workspace.' }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $resolvedBackup)) | Out-Null
    Move-Item -LiteralPath $resolvedDestination -Destination $resolvedBackup
}
[IO.Directory]::CreateDirectory($destination) | Out-Null
$proofPath = Join-Path $destination 'motion-conversion.json'
if ((Test-Path -LiteralPath $proofPath) -and -not $Reprocess) { throw 'Verified action output already exists. Use -Reprocess to preserve it in a timestamped backup first.' }
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $Aseprite
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.ArgumentList.Add('--batch')
$parameters = [ordered]@{ input=$sourceMaster; proof=$sourceProof; spec=$spec; eyes=$eyes; output=$destination; id=$Breed }
foreach ($key in $parameters.Keys) { $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key + '=' + $parameters[$key]) }
$start.ArgumentList.Add('--script')
$start.ArgumentList.Add((Join-Path $PSScriptRoot 'aseprite/extend-ruby-round-actions.lua'))
$process = [Diagnostics.Process]::Start($start)
if ($null -eq $process) {
    Start-Sleep -Milliseconds 500
    $process = [Diagnostics.Process]::Start($start)
}
if ($null -eq $process) { throw 'Aseprite process could not be started.' }
$outTask = $process.StandardOutput.ReadToEndAsync()
$errTask = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$outText = $outTask.GetAwaiter().GetResult()
$errText = $errTask.GetAwaiter().GetResult()
$code = $process.ExitCode
$process.Dispose()
[IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),$outText+$errText,[Text.UTF8Encoding]::new($false))
if ($code -ne 0 -or $errText -match '(?i)error|stack traceback') { throw ('Aseprite action conversion failed; inspect ' + (Join-Path $destination 'aseprite.log')) }
if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) { throw 'Action conversion report missing.' }
$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
$contract = Get-Content -LiteralPath $spec -Raw | ConvertFrom-Json
if ($proof.breed -ne $Breed -or $proof.version -ne 2 -or $proof.frames -ne 64 -or $proof.framesPerAction -ne 4 -or $proof.eyeStyles -ne 30 -or $proof.editableLayers -ne 32 -or $proof.actionOrder.Count -ne 16 -or $proof.resized -or $proof.quantized -or -not $proof.integerMotionOnly -or -not $proof.legacyFramesPreserved) { throw 'Incomplete native 16-action conversion.' }
$expectedIds = @($contract.actions | ForEach-Object { $_.id })
if (($proof.actionOrder -join '|') -ne ($expectedIds -join '|')) { throw 'Action order differs from the reviewed contract.' }
$sourceDigest = Get-FileHash -LiteralPath $sourceMaster -Algorithm SHA256
$sourceProofDigest = Get-FileHash -LiteralPath $sourceProof -Algorithm SHA256
if ([string]::IsNullOrWhiteSpace($sourceDigest.Hash) -or [string]::IsNullOrWhiteSpace($sourceProofDigest.Hash)) { throw 'Source digest was not produced.' }
$sourceHash = $sourceDigest.Hash.ToLowerInvariant()
$sourceProofHash = $sourceProofDigest.Hash.ToLowerInvariant()
$master = Join-Path $destination ($Breed + '-16-actions.aseprite')
$proof | Add-Member -NotePropertyName sourceAsepriteSha256 -NotePropertyValue $sourceHash -Force
$proof | Add-Member -NotePropertyName sourceProofSha256 -NotePropertyValue $sourceProofHash -Force
$masterDigest = Get-FileHash -LiteralPath $master -Algorithm SHA256
if ([string]::IsNullOrWhiteSpace($masterDigest.Hash)) { throw 'Extended master digest was not produced.' }
$proof | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue ($masterDigest.Hash.ToLowerInvariant()) -Force
$hashes = [ordered]@{}
foreach ($action in $contract.actions) {
    if ($action.kind -eq 'legacy') { continue }
    $png = Join-Path $destination ($action.id + '.png')
    if (-not (Test-Path -LiteralPath $png -PathType Leaf)) { throw ('Action sheet missing: ' + $action.id) }
    $pngDigest = Get-FileHash -LiteralPath $png -Algorithm SHA256
    if ([string]::IsNullOrWhiteSpace($pngDigest.Hash)) { throw ('Action digest was not produced: ' + $action.id) }
    $hashes[$action.id] = $pngDigest.Hash.ToLowerInvariant()
}
$proof | Add-Member -NotePropertyName pngSha256 -NotePropertyValue $hashes -Force
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
if ($Publish) {
    $imageDir = Join-Path $workspace ('local-assets/site/images/ruby-round-v1/' + $Breed + '/actions')
    $downloadDir = Join-Path $workspace 'local-assets/site/downloads/ruby-round-v1'
    [IO.Directory]::CreateDirectory($imageDir) | Out-Null
    [IO.Directory]::CreateDirectory($downloadDir) | Out-Null
    foreach ($action in $contract.actions) {
        if ($action.kind -eq 'legacy') { continue }
        Copy-Item -LiteralPath (Join-Path $destination ($action.id + '.png')) -Destination (Join-Path $imageDir ($action.id + '.png')) -Force
    }
    Copy-Item -LiteralPath $master -Destination (Join-Path $downloadDir ($Breed + '-16-actions.aseprite')) -Force
}
[ordered]@{ breed=$Breed; actions=16; frames=64; eyeStyles=30; width=$proof.width; height=$proof.height; published=[bool]$Publish } | ConvertTo-Json -Compress
