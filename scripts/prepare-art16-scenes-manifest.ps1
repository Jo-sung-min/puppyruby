param([switch]$Package)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = [IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts'))
$breedIds = @([regex]::Matches($catalog, 'id: "([a-z]+)"') | ForEach-Object {$_.Groups[1].Value})
$records = @(); $proofs = @()
foreach ($breed in $breedIds) {
    $proofPath = Join-Path $workspace ('local-assets/work/art16-scenes-v1/processed/'+$breed+'/conversion.json')
    if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) { throw ('All registered breeds must be complete before catalog registration. Missing: '+$breed) }
    $proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
    if ($proof.breed -ne $breed -or -not $proof.exactVisibleRgba -or -not $proof.editableRgbaVerified -or -not $proof.sourcePreserved -or $proof.resized -or $proof.quantized -or $proof.recolored -or $proof.fabricatedFrames -or $proof.frames -ne 12 -or $proof.colorDepth -ne 32) { throw ('Unverified breed scenes: '+$breed) }
    foreach ($source in @((Join-Path $workspace ('local-assets/work/art16-scenes-v1/raw/'+$breed+'.png')),(Join-Path (Split-Path -Parent $proofPath) 'source-input.png'))) {
        if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-FileHash -LiteralPath $source).Hash -ne $proof.sourceSha256) { throw ('Source artwork differs from verified conversion: '+$breed) }
    }
    foreach ($scene in @('idle','side','walk','happy','sleep')) {
        $item = $proof.scenes.$scene
        $png = Join-Path $workspace ('local-assets/site'+$item.png)
        if (-not (Test-Path -LiteralPath $png -PathType Leaf) -or (Get-FileHash -LiteralPath $png).Hash -ne $proof.pngSha256.$scene) { throw ('Scene export missing or changed: '+$breed+'/'+$scene) }
        $expected = if ($scene -eq 'walk') { 8 } else { 1 }
        if ($item.frames -ne $expected) { throw ('Unexpected frame count: '+$breed+'/'+$scene) }
    }
    $ase = Join-Path $workspace ('local-assets/site'+$proof.aseprite)
    if (-not (Test-Path -LiteralPath $ase -PathType Leaf) -or (Get-FileHash -LiteralPath $ase).Hash -ne $proof.asepriteSha256) { throw ('Aseprite export missing or changed: '+$breed) }
    $records += [ordered]@{breed=$breed;width=$proof.width;height=$proof.height;aseprite=$proof.aseprite;scenes=$proof.scenes}
    $proofs += $proof
}
$generated = Join-Path $workspace 'frontend/src/lib/generated/art16-scene-assets.json'
$public = Join-Path $workspace 'local-assets/site/images/art16-scenes-v1/manifest.json'
$audit = Join-Path $workspace 'local-assets/work/art16-scenes-v1/preservation-audit.json'
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($generated+'.tmp',(ConvertTo-Json -InputObject @($records) -Depth 8),$utf8)
[IO.File]::Move($generated+'.tmp',$generated,$true)
[IO.File]::WriteAllText($public,([ordered]@{version=1;styleId='art-16-scenes';breeds=$records}|ConvertTo-Json -Depth 10),$utf8)
[IO.File]::WriteAllText($audit,([ordered]@{breeds=$records.Count;scenes=$records.Count*5;frames=$records.Count*12;resized=$false;quantized=$false;recolored=$false;fabricatedFrames=$false;retainedArtworkRgbaUnchanged=$true;assets=$proofs}|ConvertTo-Json -Depth 12),$utf8)
if ($Package) {
    $readme = Join-Path $workspace 'local-assets/work/art16-scenes-v1/README.txt'
    [IO.File]::WriteAllText($readme,@'
PuppyRuby - Pixel-art 16 breed scenes

Every breed contains five scene PNGs and an editable 32-bit RGBA Aseprite file.
The Aseprite timeline has tags idle, side, happy, sleep, and walk.
Four static poses plus eight independently drawn walking frames make 12 frames.
walk.png is one horizontal strip of eight native-resolution frames (125 ms each).
All source cells retain their original resolution and visible RGBA pixels.
No resampling, palette quantization, recoloring, or synthetic walking frames.
See manifest.json for frame dimensions and preservation-audit.json for hashes.
'@,$utf8)
    $zip = Join-Path $workspace 'local-assets/site/downloads/puppyruby-art16-breed-scenes.zip'
    $temporaryZip = $zip+'.tmp'
    if (Test-Path -LiteralPath $temporaryZip) { throw 'A previous incomplete package exists. Inspect it before retrying.' }
    $archive = [IO.Compression.ZipFile]::Open($temporaryZip,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($record in $records) {
            foreach ($scene in @('idle','side','walk','happy','sleep')) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $workspace ('local-assets/site'+$record.scenes.$scene.png)),($record.breed+'/'+$scene+'.png')) | Out-Null }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $workspace ('local-assets/site'+$record.aseprite)),($record.breed+'/'+$record.breed+'.aseprite')) | Out-Null
        }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$public,'manifest.json') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$audit,'preservation-audit.json') | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$readme,'README.txt') | Out-Null
    } finally { $archive.Dispose() }
    [IO.File]::Move($temporaryZip,$zip,$true)
}
[ordered]@{breeds=$records.Count;scenes=$records.Count*5;frames=$records.Count*12;manifest=$generated;packaged=[bool]$Package} | ConvertTo-Json -Compress
