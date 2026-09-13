param(
    [Parameter(Mandatory=$true)][ValidatePattern('^sp-(0[1-9]|1[0-5])$')][string]$Id,
    [Parameter(Mandatory=$true)][string]$InputPng,
    [Parameter(Mandatory=$true)][string]$Config,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$Publish,
    [switch]$VerifyExisting
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = [IO.Path]::GetFullPath($InputPng)
$metadata = [IO.Path]::GetFullPath($Config)
foreach ($required in @($source,$metadata,$Aseprite)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw 'Required artwork, metadata, or Aseprite executable was not found.' }
}
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$configHash = (Get-FileHash -LiteralPath $metadata -Algorithm SHA256).Hash
$configuration = [IO.File]::ReadAllText($metadata) | ConvertFrom-Json
if ($configuration.id -and $configuration.id -ne $Id) { throw 'Metadata belongs to a different candidate.' }
$destination = Join-Path $workspace ('local-assets/work/soft-pixel-v1/processed/' + $Id)
$originalDirectory = Join-Path $workspace 'local-assets/work/soft-pixel-v1/originals'
[IO.Directory]::CreateDirectory($destination) | Out-Null
[IO.Directory]::CreateDirectory($originalDirectory) | Out-Null
$originalCopy = Join-Path $originalDirectory ($Id+'.png')
if (Test-Path -LiteralPath $originalCopy) {
    if ((Get-FileHash -LiteralPath $originalCopy).Hash -ne $sourceHash) { throw 'A different original already exists for this candidate; review as a new version.' }
} else { Copy-Item -LiteralPath $source -Destination $originalCopy }
$proofPath = Join-Path $destination 'conversion.json'
if (-not $VerifyExisting) {
    if (Test-Path -LiteralPath (Join-Path $destination ($Id+'.aseprite'))) { throw 'Refusing to overwrite an editable master. Use -VerifyExisting to verify an unchanged import.' }
    $isolated = Join-Path $destination 'source-input.png'
    if (Test-Path -LiteralPath $isolated) { throw 'A partial import exists. Inspect it before retrying.' }
    Copy-Item -LiteralPath $source -Destination $isolated
    Copy-Item -LiteralPath $metadata -Destination (Join-Path $destination 'input-config.json')
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('--batch','--script-param',('input='+$isolated),'--script-param',('output='+$destination),'--script-param',('id='+$Id),'--script-param',('config='+(Join-Path $destination 'input-config.json')),'--script',(Join-Path $PSScriptRoot 'aseprite/import-soft-pixel-candidate.lua'))) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $code = $process.ExitCode
    $process.Dispose()
    [IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),('Exit code: '+$code+[Environment]::NewLine+$stdout+$stderr),[Text.UTF8Encoding]::new($false))
    if ($code -ne 0 -or $stderr -match 'error|invalid|not supported') { throw 'Aseprite conversion failed. Inspect aseprite.log.' }
}
if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) { throw 'Aseprite did not complete its export checks.' }
$proof = [IO.File]::ReadAllText($proofPath) | ConvertFrom-Json
if ($proof.id -ne $Id -or -not $proof.exactExportRgba -or $proof.bodyArtworkGeneratedByCode -or $proof.editableEyeGroups -ne 4 -or $proof.editableEyeLayers -ne 12 -or $proof.frames -ne 1 -or $proof.quantized -or $proof.recolored) { throw 'The import does not preserve the required body and separate eye layers.' }
if ($VerifyExisting -and ($proof.sourceSha256 -ne $sourceHash -or $proof.configSha256 -ne $configHash)) { throw 'Source artwork or eye metadata differs from the verified import.' }
if ((Get-FileHash -LiteralPath $source).Hash -ne $sourceHash -or (Get-FileHash -LiteralPath $originalCopy).Hash -ne $sourceHash) { throw 'Original artwork changed unexpectedly.' }
$ase = Join-Path $destination ($Id+'.aseprite')
$bytes = [IO.File]::ReadAllBytes($ase)
if ($bytes.Length -lt 128 -or [BitConverter]::ToUInt16($bytes,4) -ne 0xA5E0 -or [BitConverter]::ToUInt16($bytes,6) -ne 1 -or [BitConverter]::ToUInt16($bytes,8) -ne $proof.width -or [BitConverter]::ToUInt16($bytes,10) -ne $proof.height -or [BitConverter]::ToUInt16($bytes,12) -ne 32) { throw 'Editable Aseprite file has invalid dimensions, frames, or color mode.' }
$exports = @('body','eyes-dot','eyes-bean','eyes-sparkle','eyes-sleep','preview')
$hashes = [ordered]@{}
foreach ($name in $exports) {
    $file = Join-Path $destination ($name+'.png')
    $png = [IO.File]::ReadAllBytes($file)
    if ($png.Length -lt 33 -or $png[0] -ne 137 -or $png[1] -ne 80 -or $png[25] -ne 6) { throw 'Expected a true RGBA PNG export.' }
    $hashes[$name] = (Get-FileHash -LiteralPath $file).Hash
}
$proof | Add-Member -NotePropertyName sourceSha256 -NotePropertyValue $sourceHash -Force
$proof | Add-Member -NotePropertyName configSha256 -NotePropertyValue $configHash -Force
$proof | Add-Member -NotePropertyName sourcePreserved -NotePropertyValue $true -Force
$proof | Add-Member -NotePropertyName pngSha256 -NotePropertyValue $hashes -Force
$proof | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue ((Get-FileHash -LiteralPath $ase).Hash) -Force
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
if ($Publish) {
    $imageDirectory = Join-Path $workspace ('local-assets/site/images/soft-pixel-v1/'+$Id)
    $downloadDirectory = Join-Path $workspace 'local-assets/site/downloads/soft-pixel-v1'
    [IO.Directory]::CreateDirectory($imageDirectory) | Out-Null
    [IO.Directory]::CreateDirectory($downloadDirectory) | Out-Null
    $copies = @($exports | ForEach-Object { @{Source=(Join-Path $destination ($_+'.png'));Target=(Join-Path $imageDirectory ($_+'.png'))} })
    $copies += @{Source=$ase;Target=(Join-Path $downloadDirectory ($Id+'.aseprite'))}
    # Validate every destination before publishing any file.
    foreach ($copy in $copies) {
        if ((Test-Path -LiteralPath $copy.Target) -and (Get-FileHash -LiteralPath $copy.Target).Hash -ne (Get-FileHash -LiteralPath $copy.Source).Hash) { throw 'Refusing to overwrite different published artwork.' }
    }
    foreach ($copy in $copies) { if (-not (Test-Path -LiteralPath $copy.Target)) { Copy-Item -LiteralPath $copy.Source -Destination $copy.Target } }
}
[ordered]@{id=$Id;width=$proof.width;height=$proof.height;eyePresets=4;editableEyeLayers=12;sourcePreserved=$true;published=[bool]$Publish} | ConvertTo-Json -Compress
