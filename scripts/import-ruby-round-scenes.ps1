param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed,
    [string]$InputPng,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [ValidateSet('transparent','border-magenta')][string]$Background = 'border-magenta',
    [string]$Anchors,
    [switch]$Publish,
    [switch]$VerifyExisting,
    [switch]$Reprocess
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$breedIds = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
if ($breedIds -notcontains $Breed) { throw 'Unknown registered breed.' }
$work = Join-Path $workspace 'local-assets/work/ruby-round-v1'
if (-not $InputPng) { $InputPng = Join-Path $work ('originals/'+$Breed+'.png') }
$source = [IO.Path]::GetFullPath($InputPng)
$destination = Join-Path $work ('processed/'+$Breed)
$eyes = Join-Path $work 'eyes'
if (-not (Test-Path -LiteralPath $Aseprite -PathType Leaf)) { throw 'Paid Aseprite executable not found.' }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Generated source atlas not found.' }
$sourceHash = (Get-FileHash -LiteralPath $source).Hash
$overrideFile=Join-Path $PSScriptRoot 'ruby-round-cleanup-overrides.json'
$overrides=Get-Content -LiteralPath $overrideFile -Raw | ConvertFrom-Json -AsHashtable
if ($overrides.ContainsKey($Breed) -and $overrides[$Breed].sourceSha256 -ne $sourceHash) { throw 'Reviewed cleanup regions belong to a different original source hash.' }
if ($Reprocess -and $VerifyExisting) { throw 'Reprocess and VerifyExisting cannot be combined.' }
if ($Reprocess -and (Test-Path -LiteralPath $destination)) {
    $backup=[IO.Path]::GetFullPath((Join-Path $work ('backups/'+$Breed+'-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))))
    $resolvedDestination=[IO.Path]::GetFullPath($destination)
    $boundary=$workspace.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    if (-not $resolvedDestination.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -or -not $backup.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Reprocessing paths must remain in the workspace.' }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $backup)) | Out-Null
    Move-Item -LiteralPath $resolvedDestination -Destination $backup
}
[IO.Directory]::CreateDirectory($destination) | Out-Null
[IO.Directory]::CreateDirectory($eyes) | Out-Null
function Invoke-Aseprite([string]$Script, [hashtable]$Parameters) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Aseprite; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.ArgumentList.Add('--batch')
    foreach ($key in $Parameters.Keys) { $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($key+'='+$Parameters[$key]) }
    $start.ArgumentList.Add('--script'); $start.ArgumentList.Add((Join-Path $PSScriptRoot ('aseprite/'+$Script)))
    $process = [Diagnostics.Process]::Start($start)
    $outTask=$process.StandardOutput.ReadToEndAsync(); $errTask=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit(); $outText=$outTask.GetAwaiter().GetResult(); $errText=$errTask.GetAwaiter().GetResult(); $code=$process.ExitCode
    $process.Dispose()
    [IO.File]::WriteAllText((Join-Path $destination ($Script+'.log')), $outText+$errText, [Text.UTF8Encoding]::new($false))
    if ($code -ne 0 -or $errText -match '(?i)error|stack traceback') { throw ('Aseprite conversion failed; inspect '+$Script+'.log') }
}
if (-not (Test-Path -LiteralPath (Join-Path $eyes 'manifest.json'))) { Invoke-Aseprite 'create-ruby-round-eyes.lua' @{ output=$eyes } }
if (-not $VerifyExisting) {
    if (Test-Path -LiteralPath (Join-Path $destination 'conversion.json')) { throw 'Verified output already exists. Preserve it in a new version before replacing.' }
    Copy-Item -LiteralPath $source -Destination (Join-Path $destination 'source-input.png')
    Invoke-Aseprite 'import-ruby-round-scenes.lua' @{ input=(Join-Path $destination 'source-input.png'); output=$destination; id=$Breed; eyes=$eyes; background=$Background; anchors=$Anchors; overrides=$overrideFile }
}
$proofPath=Join-Path $destination 'conversion.json'
if (-not (Test-Path -LiteralPath $proofPath)) { throw 'Conversion report missing.' }
$proof=Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
if ($proof.breed -ne $Breed -or $proof.frames -ne 20 -or $proof.eyeStyles -ne 30 -or $proof.resized -or $proof.quantized -or $proof.fabricatedFrames -or -not $proof.retainedArtworkRgbaUnchanged -or -not $proof.editableRgbaVerified) { throw 'Incomplete native scene conversion.' }
if ($proof.sourceSha256 -and $proof.sourceSha256 -ne $sourceHash) { throw 'Source changed after conversion.' }
$proof | Add-Member -NotePropertyName sourceSha256 -NotePropertyValue $sourceHash -Force
$proof | Add-Member -NotePropertyName asepriteSha256 -NotePropertyValue (Get-FileHash -LiteralPath (Join-Path $destination ($Breed+'.aseprite'))).Hash -Force
$hashes=[ordered]@{}
foreach ($scene in @('idle','side','walk','happy','sleep')) {
    $hashes[$scene]=(Get-FileHash -LiteralPath (Join-Path $destination ($scene+'.png'))).Hash
    $hashes[$scene+'-default']=(Get-FileHash -LiteralPath (Join-Path $destination ($scene+'-default.png'))).Hash
    $hashes[$scene+'-desktop']=(Get-FileHash -LiteralPath (Join-Path $destination ($scene+'-desktop.png'))).Hash
}
$proof | Add-Member -NotePropertyName pngSha256 -NotePropertyValue $hashes -Force
[IO.File]::WriteAllText($proofPath,($proof | ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
if ($Publish) {
    $images=Join-Path $workspace ('local-assets/site/images/ruby-round-v1/'+$Breed)
    $downloads=Join-Path $workspace 'local-assets/site/downloads/ruby-round-v1'
    $publicEyes=Join-Path $workspace 'local-assets/site/images/ruby-round-v1/eyes'
    foreach ($folder in @($images,$downloads,$publicEyes)) { [IO.Directory]::CreateDirectory($folder) | Out-Null }
    foreach ($scene in @('idle','side','walk','happy','sleep')) {
        Copy-Item -LiteralPath (Join-Path $destination ($scene+'.png')) -Destination (Join-Path $images ($scene+'.png'))
        Copy-Item -LiteralPath (Join-Path $destination ($scene+'-default.png')) -Destination (Join-Path $images ($scene+'-default.png'))
        Copy-Item -LiteralPath (Join-Path $destination ($scene+'-desktop.png')) -Destination (Join-Path $images ($scene+'-desktop.png'))
    }
    Copy-Item -LiteralPath (Join-Path $destination ($Breed+'.aseprite')) -Destination (Join-Path $downloads ($Breed+'.aseprite'))
    foreach ($eyeFile in Get-ChildItem -LiteralPath $eyes -File -Filter '*.png') { Copy-Item -LiteralPath $eyeFile.FullName -Destination (Join-Path $publicEyes $eyeFile.Name) }
    Copy-Item -LiteralPath (Join-Path $eyes 'manifest.json') -Destination (Join-Path $publicEyes 'manifest.json')
    Copy-Item -LiteralPath (Join-Path $eyes 'ruby-round-eyes.aseprite') -Destination (Join-Path $downloads 'ruby-round-eyes.aseprite')
}
[ordered]@{ breed=$Breed; scenes=5; frames=20; eyeStyles=30; width=$proof.width; height=$proof.height; published=[bool]$Publish } | ConvertTo-Json -Compress
