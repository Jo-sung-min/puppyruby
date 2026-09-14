param([switch]$Complete)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$breedIds=@([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')),'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
$records=@();$pending=@();$inventory=@();$downloadInventory=@()
$desktopMetaPath=Join-Path $workspace 'frontend/src/lib/generated/desktop-appearance-assets.json'
$desktopMeta=Get-Content -LiteralPath $desktopMetaPath -Raw | ConvertFrom-Json -AsHashtable
foreach ($breed in $breedIds) {
    $file=Join-Path $workspace ('local-assets/work/ruby-round-v1/processed/'+$breed+'/conversion.json')
    if (-not (Test-Path -LiteralPath $file)) { $pending+=$breed; continue }
    $proof=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($proof.breed -ne $breed -or $proof.frames -ne 20 -or $proof.eyeStyles -ne 30 -or -not $proof.retainedArtworkRgbaUnchanged -or -not $proof.editableRgbaVerified -or -not $proof.sourceSha256) { throw ('Unverified breed '+$breed) }
    foreach ($scene in @('idle','side','walk','happy','sleep')) {
        $public=$proof.scenes.$scene.png
        $local=Join-Path $workspace ('local-assets/site'+$public)
        if (-not (Test-Path -LiteralPath $local) -or (Get-FileHash -LiteralPath $local).Hash -ne $proof.pngSha256.$scene) { throw ('Published scene hash mismatch '+$breed+'/'+$scene) }
        $inventory += @{ path=$public; sha256=$proof.pngSha256.$scene; bytes=(Get-Item -LiteralPath $local).Length }
        $desktopKey=$scene+'-desktop';$desktop=$proof.scenes.$scene.desktopPng
        $desktopLocal=Join-Path $workspace ('local-assets/site'+$desktop)
        if (-not (Test-Path -LiteralPath $desktopLocal) -or (Get-FileHash -LiteralPath $desktopLocal).Hash -ne $proof.pngSha256.$desktopKey) { throw ('Published desktop scene mismatch '+$breed+'/'+$scene) }
        $inventory += @{ path=$desktop; sha256=$proof.pngSha256.$desktopKey; bytes=(Get-Item -LiteralPath $desktopLocal).Length }
        $previewKey=$scene+'-default';$preview='/images/ruby-round-v1/'+$breed+'/'+$previewKey+'.png';$previewLocal=Join-Path $workspace ('local-assets/site'+$preview)
        if ((Get-FileHash -LiteralPath $previewLocal).Hash -ne $proof.pngSha256.$previewKey) { throw ('Published preview mismatch '+$breed+'/'+$scene) }
        $inventory += @{path=$preview;sha256=$proof.pngSha256.$previewKey;bytes=(Get-Item -LiteralPath $previewLocal).Length}
        $desktopMeta[$desktop]=[ordered]@{sha256=$proof.pngSha256.$desktopKey.ToLowerInvariant();width=$proof.width*$proof.scenes.$scene.desktopFrames;height=$proof.height;bytes=(Get-Item -LiteralPath $desktopLocal).Length}
    }
    $ase=Join-Path $workspace ('local-assets/site'+$proof.aseprite)
    if (-not (Test-Path -LiteralPath $ase) -or (Get-FileHash -LiteralPath $ase).Hash -ne $proof.asepriteSha256) { throw ('Published editable master mismatch '+$breed) }
    $downloadInventory += @{path=$proof.aseprite;sha256=$proof.asepriteSha256;bytes=(Get-Item -LiteralPath $ase).Length}
    $records += [ordered]@{breed=$breed;width=$proof.width;height=$proof.height;aseprite=$proof.aseprite;scenes=$proof.scenes}
}
if ($Complete -and $pending.Count) { throw ('Missing registered breeds: '+($pending -join ', ')) }
for ($eye=1;$eye -le 30;$eye++) {
    $eyePath='/images/ruby-round-v1/eyes/eye-'+$eye.ToString('00')+'.png';$eyeLocal=Join-Path $workspace ('local-assets/site'+$eyePath)
    $inventory += @{path=$eyePath;sha256=(Get-FileHash -LiteralPath $eyeLocal).Hash;bytes=(Get-Item -LiteralPath $eyeLocal).Length}
}
$sharedEyeMaster='/downloads/ruby-round-v1/ruby-round-eyes.aseprite';$sharedEyeLocal=Join-Path $workspace ('local-assets/site'+$sharedEyeMaster)
$downloadInventory += @{path=$sharedEyeMaster;sha256=(Get-FileHash -LiteralPath $sharedEyeLocal).Hash;bytes=(Get-Item -LiteralPath $sharedEyeLocal).Length}
$utf8=[Text.UTF8Encoding]::new($false)
$json=ConvertTo-Json -InputObject @($records) -Depth 12
[IO.File]::WriteAllText((Join-Path $workspace 'frontend/src/lib/generated/ruby-round-scene-assets.json'),$json,$utf8)
[IO.File]::WriteAllText($desktopMetaPath,($desktopMeta|ConvertTo-Json -Depth 8),$utf8)
$publicManifest=Join-Path $workspace 'local-assets/site/images/ruby-round-v1/manifest.json'
[IO.Directory]::CreateDirectory((Split-Path -Parent $publicManifest)) | Out-Null
[IO.File]::WriteAllText($publicManifest,([ordered]@{version=1;complete=($pending.Count -eq 0);breeds=$records;pending=$pending}|ConvertTo-Json -Depth 13),$utf8)
[IO.File]::WriteAllText((Join-Path $workspace 'local-assets/work/ruby-round-v1/site-assets-inventory.json'),([ordered]@{complete=($pending.Count -eq 0);images=$inventory.Count;downloads=$downloadInventory.Count;assets=$inventory;downloadAssets=$downloadInventory}|ConvertTo-Json -Depth 6),$utf8)
[ordered]@{complete=($pending.Count -eq 0);breeds=$records.Count;scenes=$records.Count*5;frames=$records.Count*20;pending=$pending} | ConvertTo-Json -Compress
