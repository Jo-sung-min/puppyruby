param(
    [Parameter(Mandatory=$true)][ValidateSet('sp08','sp15')][string]$Style,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed,
    [Parameter(Mandatory=$true)][string]$InputPng,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [ValidateSet('transparent','border-white','border-magenta')][string]$Background = 'transparent',
    [switch]$Publish,
    [switch]$VerifyExisting,
    [switch]$RetryFailed,
    [string]$RegistrationProof
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = [IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts'))
$breedIds = @([regex]::Matches($catalog, 'id: "([a-z]+)"') | ForEach-Object {$_.Groups[1].Value})
if ($breedIds -notcontains $Breed) { throw 'Breed is not in the registered dog catalog.' }
$source = [IO.Path]::GetFullPath($InputPng)
$destination = Join-Path $workspace ('local-assets/work/sp-scenes-v1/' + $Style + '/processed/' + $Breed)
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Source atlas was not found.' }
if (-not (Test-Path -LiteralPath $Aseprite -PathType Leaf)) { throw 'Full Aseprite executable was not found.' }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
if ($RegistrationProof) {
    $RegistrationProof = [IO.Path]::GetFullPath($RegistrationProof)
    if (-not $RegistrationProof.StartsWith($workspace.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Registration proof must remain inside the workspace.' }
    $registration = Get-Content -LiteralPath $RegistrationProof -Raw | ConvertFrom-Json
    if ($registration.style -ne $Style -or $registration.breed -ne $Breed -or $registration.sourceSha256 -ne $sourceHash -or -not $registration.exactVisibleRgba) { throw 'Preserved registration does not match the verified source.' }
}
[IO.Directory]::CreateDirectory($destination) | Out-Null
if (-not $VerifyExisting) {
    if (Test-Path -LiteralPath (Join-Path $destination ($Breed + '.aseprite'))) { throw 'Refusing to overwrite an existing editable master. Use a new source version after review.' }
    $isolated = Join-Path $destination 'source-input.png'
    if (Test-Path -LiteralPath $isolated) {
        if (-not $RetryFailed -or (Test-Path -LiteralPath (Join-Path $destination 'conversion.json')) -or (Get-FileHash -LiteralPath $isolated).Hash -ne $sourceHash) { throw 'A previous conversion exists. Inspect it before retrying.' }
    } else { Copy-Item -LiteralPath $source -Destination $isolated }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    foreach ($argument in @('--batch','--script-param',('input='+$isolated),'--script-param',('output='+$destination),'--script-param',('id='+$Breed),'--script-param',('style='+$Style),'--script-param',('background='+$Background),'--script-param',('registration='+$RegistrationProof),'--script',(Join-Path $PSScriptRoot 'aseprite/import-sp-scenes.lua'))) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit(); $stdout = $stdoutTask.GetAwaiter().GetResult(); $stderr = $stderrTask.GetAwaiter().GetResult()
    $code = $process.ExitCode; $process.Dispose()
    [IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),('Exit code: '+$code+[Environment]::NewLine+$stdout+$stderr),[Text.UTF8Encoding]::new($false))
    if ($code -ne 0 -or $stderr -match 'error|invalid|not supported') { throw 'Aseprite conversion failed. Inspect the conversion log.' }
}
$proofPath = Join-Path $destination 'conversion.json'
if (-not (Test-Path -LiteralPath $proofPath)) { throw 'Aseprite did not complete and verify all six scenes.' }
$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
if ($proof.style -ne $Style -or $proof.breed -ne $Breed -or -not $proof.exactVisibleRgba -or $proof.resized -or $proof.quantized -or $proof.recolored -or $proof.fabricatedFrames -or $proof.frames -ne 16) { throw 'Unverified scene conversion.' }
if ($VerifyExisting -and $proof.sourceSha256 -ne $sourceHash) { throw 'The source atlas differs from the already verified conversion. Review it as a new version.' }
if ((Get-FileHash -LiteralPath $source).Hash -ne $sourceHash) { throw 'Generated source changed unexpectedly.' }
$ase = Join-Path $destination ($Breed + '.aseprite')
$bytes = [IO.File]::ReadAllBytes($ase)
if ($bytes.Length -lt 128 -or [BitConverter]::ToUInt16($bytes,4) -ne 0xA5E0 -or [BitConverter]::ToUInt16($bytes,6) -ne 16 -or [BitConverter]::ToUInt16($bytes,8) -ne $proof.width -or [BitConverter]::ToUInt16($bytes,10) -ne $proof.height -or [BitConverter]::ToUInt16($bytes,12) -ne 32) { throw 'Editable Aseprite file does not preserve the 16 full-resolution RGBA frames.' }
$hashes = [ordered]@{}
foreach ($scene in @('idle','side','walk','happy','sleep','wag')) {
    $file = Join-Path $destination ($scene+'.png')
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ('Missing scene export: '+$scene) }
    $hashes[$scene] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}
$proof | Add-Member -NotePropertyName sourceSha256 -NotePropertyValue $sourceHash -Force
$proof | Add-Member -NotePropertyName sourcePreserved -NotePropertyValue $true -Force
$proof | Add-Member -NotePropertyName pngSha256 -NotePropertyValue $hashes -Force
$proof | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue ((Get-FileHash -LiteralPath $ase).Hash) -Force
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
if ($Publish) {
    $imageDirectory = Join-Path $workspace ('local-assets/site/images/sp-scenes-v1/'+$Style+'/'+$Breed)
    $downloadDirectory = Join-Path $workspace ('local-assets/site/downloads/sp-scenes-v1/'+$Style)
    [IO.Directory]::CreateDirectory($imageDirectory) | Out-Null
    [IO.Directory]::CreateDirectory($downloadDirectory) | Out-Null
    foreach ($scene in @('idle','side','walk','happy','sleep','wag')) {
        $target = Join-Path $imageDirectory ($scene+'.png')
        if (Test-Path -LiteralPath $target) { if ((Get-FileHash -LiteralPath $target).Hash -ne $hashes[$scene]) { throw 'Refusing to overwrite a different published image.' } }
        else { Copy-Item -LiteralPath (Join-Path $destination ($scene+'.png')) -Destination $target }
    }
    $aseTarget = Join-Path $downloadDirectory ($Breed+'.aseprite')
    if (Test-Path -LiteralPath $aseTarget) { if ((Get-FileHash -LiteralPath $aseTarget).Hash -ne $proof.asepriteSha256) { throw 'Refusing to overwrite a different published Aseprite master.' } }
    else { Copy-Item -LiteralPath $ase -Destination $aseTarget }
}
[ordered]@{style=$Style;breed=$Breed;scenes=6;frames=16;width=$proof.width;height=$proof.height;sourcePreserved=$true;exactVisibleRgba=$true;published=[bool]$Publish} | ConvertTo-Json -Compress
