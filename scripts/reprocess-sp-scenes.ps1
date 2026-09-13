param(
    [Parameter(Mandatory=$true)][ValidateSet('sp08','sp15')][string]$Style,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$RevisionLabel,
    [switch]$PreserveRegistration
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$allowedPrefix = $workspace.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
function Resolve-TaskPath([string]$relative) {
    $resolved = [IO.Path]::GetFullPath((Join-Path $workspace $relative))
    if (-not $resolved.StartsWith($allowedPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to move an artifact outside the workspace.' }
    return $resolved
}
$processed = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/processed/'+$Breed)
$images = Resolve-TaskPath ('local-assets/site/images/sp-scenes-v1/'+$Style+'/'+$Breed)
$aseprite = Resolve-TaskPath ('local-assets/site/downloads/sp-scenes-v1/'+$Style+'/'+$Breed+'.aseprite')
$backup = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/previous/'+$RevisionLabel+'/'+$Breed)
$backupProcessed = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/previous/'+$RevisionLabel+'/'+$Breed+'/processed')
$backupImages = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/previous/'+$RevisionLabel+'/'+$Breed+'/images')
$backupAseprite = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/previous/'+$RevisionLabel+'/'+$Breed+'/'+$Breed+'.aseprite')
$source = Resolve-TaskPath ('local-assets/work/sp-scenes-v1/'+$Style+'/originals/'+$Breed+'.png')
$proof = Get-Content -LiteralPath (Join-Path $processed 'conversion.json') -Raw | ConvertFrom-Json
if ($proof.breed -ne $Breed -or (Get-FileHash -LiteralPath $source).Hash -ne $proof.sourceSha256) { throw 'The source differs from the previous verified artwork.' }
if (Test-Path -LiteralPath $backup) { throw 'Revision backup already exists; previous artifacts will not be overwritten.' }
foreach ($scene in @('idle','side','walk','happy','sleep','wag')) {
    if ((Get-FileHash -LiteralPath (Join-Path $images ($scene+'.png'))).Hash -ne $proof.pngSha256.$scene) { throw 'A published image was independently edited. Inspect it before reprocessing.' }
}
if ((Get-FileHash -LiteralPath $aseprite).Hash -ne $proof.asepriteSha256) { throw 'The published editable master was independently edited.' }
# Every absolute source and destination is resolved and checked above. Preserve
# the complete previous conversion and publication; no recursive deletion.
[IO.Directory]::CreateDirectory($backup) | Out-Null
Move-Item -LiteralPath $processed -Destination $backupProcessed
Move-Item -LiteralPath $images -Destination $backupImages
Move-Item -LiteralPath $aseprite -Destination $backupAseprite
if ($PreserveRegistration) {
    & (Join-Path $PSScriptRoot 'import-sp-scenes.ps1') -Style $Style -Breed $Breed -InputPng $source -Background border-magenta -Publish -RegistrationProof (Join-Path $backupProcessed 'conversion.json')
} else { & (Join-Path $PSScriptRoot 'import-sp-scenes.ps1') -Style $Style -Breed $Breed -InputPng $source -Background border-magenta -Publish }
