param([switch]$Package)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$records=@();$proofs=@()
foreach($number in 1..30){
    $id='art-{0:00}' -f $number
    $png=Join-Path $workspace ('local-assets/site/images/pixel-art-dogs-v1/'+$id+'.png')
    $ase=Join-Path $workspace ('local-assets/site/downloads/pixel-art-dogs-v1/'+$id+'.aseprite')
    $original=Join-Path $workspace ('local-assets/site/images/pixel-art-v1/'+$id+'.png')
    $proof=Join-Path $workspace ('local-assets/work/original-art-dogs-v1/processed/'+$id+'/conversion.json')
    foreach($file in @($png,$ase,$original,$proof)){if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw ('Missing asset or proof: '+$id)}}
    $conversion=Get-Content -LiteralPath $proof -Raw | ConvertFrom-Json
    if(-not $conversion.exactVisibleRgba -or -not $conversion.sourcePreserved -or $conversion.resized -or $conversion.quantized -or $conversion.recolored -or $conversion.colorDepth -ne 32 -or $conversion.pixelComparison.changedArtworkRgbaPixels -ne 0 -or $conversion.transparentPixels -eq 0){throw ('Unverified master cannot be registered: '+$id)}
    if((Get-FileHash -LiteralPath $png).Hash -ne $conversion.pngSha256 -or (Get-FileHash -LiteralPath $ase).Hash -ne $conversion.asepriteSha256 -or (Get-FileHash -LiteralPath $original).Hash -ne $conversion.sourceSha256){throw ('Verified asset hash mismatch: '+$id)}
    $records+=[ordered]@{id=$id;width=$conversion.width;height=$conversion.height;png='/images/pixel-art-dogs-v1/'+$id+'.png';aseprite='/downloads/pixel-art-dogs-v1/'+$id+'.aseprite'}
    $proofs+=$conversion
}
$manifest=Join-Path $workspace 'frontend/src/lib/generated/pixel-art-dog-assets.json'
$temporary=$manifest+'.tmp'
[IO.File]::WriteAllText($temporary,(ConvertTo-Json -InputObject @($records) -Depth 4),[Text.UTF8Encoding]::new($false))
[IO.File]::Move($temporary,$manifest,$true)
$audit=Join-Path $workspace 'local-assets/work/original-art-dogs-v1/preservation-audit.json'
[IO.File]::WriteAllText($audit,([ordered]@{count=30;originalsByteUnchanged=$true;retainedArtworkRgbaUnchanged=$true;resized=$false;quantized=$false;recolored=$false;assets=$proofs}|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
if($Package){
    $readme=Join-Path $workspace 'local-assets/work/original-art-dogs-v1/README.txt'
    [IO.File]::WriteAllText($readme,@'
PuppyRuby - 30 applicable original pixel-art dog styles

IDs: art-01 through art-30. Each pair contains a full original-resolution
RGBA PNG and an editable 32-bit RGBA Aseprite file (one layer, one frame).
Original comparison PNGs remain byte-for-byte unchanged in pixel-art-v1.
No resizing, palette quantization, recoloring or animation was introduced.
The 13 sources already using alpha retain their visible RGBA exactly.
For 17 opaque sources, only near-white neutral pixels connected to the
canvas border were removed (minimum RGB 245, channel spread at most 8).
All other source RGBA pixels are retained exactly, including white fur.
See preservation-audit.json for per-file dimensions and pixel hashes.
'@,[Text.UTF8Encoding]::new($false))
    $files=@()
    foreach($record in $records){$files+=Join-Path $workspace ('local-assets/site'+$record.png);$files+=Join-Path $workspace ('local-assets/site'+$record.aseprite)}
    $files+=@($readme,$audit,$manifest)
    $zip=Join-Path $workspace 'local-assets/site/downloads/puppyruby-pixel-art-dogs-30.zip'
    Compress-Archive -LiteralPath $files -DestinationPath $zip -CompressionLevel Optimal -Force
}
[PSCustomObject]@{count=$records.Count;manifest=$manifest;opaqueBackgroundsCleaned=@($proofs|Where-Object{$_.pixelComparison.removedBorderBackgroundPixels -gt 0}).Count;transparentSourcesPreserved=@($proofs|Where-Object{$_.pixelComparison.removedBorderBackgroundPixels -eq 0}).Count}|ConvertTo-Json -Compress
