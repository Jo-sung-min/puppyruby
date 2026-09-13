param([switch]$Complete, [switch]$Package)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = [IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts'))
$breedIds = @([regex]::Matches($catalog, 'id: "([a-z]+)"') | ForEach-Object {$_.Groups[1].Value})
$records = @(); $proofs = @(); $pending = @(); $entries = @()
$utf8 = [Text.UTF8Encoding]::new($false)
$reactionPath = Join-Path $workspace 'local-assets/work/sp-scenes-v1/reaction-anchors.json'
$reactionAnchors = if (Test-Path -LiteralPath $reactionPath -PathType Leaf) { Get-Content -LiteralPath $reactionPath -Raw | ConvertFrom-Json -AsHashtable } else { @{} }
foreach ($style in @('sp08','sp15')) {
    foreach ($breed in $breedIds) {
        $directory = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$style+'/processed/'+$breed)
        $proofPath = Join-Path $directory 'conversion.json'
        if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) { $pending += ($style+'/'+$breed); continue }
        $proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
        if ($proof.style -ne $style -or $proof.breed -ne $breed -or -not $proof.exactVisibleRgba -or -not $proof.editableRgbaVerified -or -not $proof.sourcePreserved -or $proof.resized -or $proof.quantized -or $proof.recolored -or $proof.fabricatedFrames -or $proof.frames -ne 16 -or $proof.colorDepth -ne 32 -or $proof.uniqueWalkFrames -ne 8 -or $proof.uniqueWagFrames -ne 4) { throw ('Unverified style/breed scenes: '+$style+'/'+$breed) }
        $original = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$style+'/originals/'+$breed+'.png')
        foreach ($source in @($original,(Join-Path $directory 'source-input.png'))) {
            if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-FileHash -LiteralPath $source).Hash -ne $proof.sourceSha256) { throw ('Source artwork differs from verified conversion: '+$style+'/'+$breed) }
        }
        foreach ($scene in @('idle','side','walk','happy','sleep','wag')) {
            $item = $proof.scenes.$scene
            $png = Join-Path $workspace ('local-assets/site'+$item.png)
            $expectedPath = '/images/sp-scenes-v1/'+$style+'/'+$breed+'/'+$scene+'.png'
            if ($item.png -ne $expectedPath -or -not (Test-Path -LiteralPath $png -PathType Leaf) -or (Get-FileHash -LiteralPath $png).Hash -ne $proof.pngSha256.$scene) { throw ('Scene export missing or changed: '+$style+'/'+$breed+'/'+$scene) }
            $expected = if ($scene -eq 'walk') { 8 } elseif ($scene -eq 'wag') { 4 } else { 1 }
            if ($item.frames -ne $expected -or @($proof.frameBounds.$scene).Count -ne $expected) { throw ('Unexpected frame count or bounds: '+$style+'/'+$breed+'/'+$scene) }
            $entries += @{Path=$png;Name=($style+'/'+$breed+'/'+$scene+'.png')}
        }
        $ase = Join-Path $workspace ('local-assets/site'+$proof.aseprite)
        if ($proof.aseprite -ne ('/downloads/sp-scenes-v1/'+$style+'/'+$breed+'.aseprite') -or -not (Test-Path -LiteralPath $ase -PathType Leaf) -or (Get-FileHash -LiteralPath $ase).Hash -ne $proof.asepriteSha256) { throw ('Aseprite master missing or changed: '+$style+'/'+$breed) }
        $record = [ordered]@{style=$style;breed=$breed;width=$proof.width;height=$proof.height;aseprite=$proof.aseprite;scenes=$proof.scenes;frameBounds=$proof.frameBounds}
        $reaction = $reactionAnchors[$style+'/'+$breed]
        if ($null -ne $reaction) {
            if ($reaction.width -ne $proof.width -or $reaction.height -ne $proof.height -or @($reaction.eyes).Count -ne 2 -or @($reaction.paws).Count -ne 2) { throw ('Native reaction anchors differ from scene canvas: '+$style+'/'+$breed) }
            foreach ($point in @($reaction.eyes)+@($reaction.paws)) {
                if ($point.rx -le 0 -or $point.ry -le 0 -or $point.x-$point.rx -lt 0 -or $point.y-$point.ry -lt 0 -or $point.x+$point.rx -gt $proof.width -or $point.y+$point.ry -gt $proof.height) { throw ('Native reaction anchor leaves source canvas: '+$style+'/'+$breed) }
            }
            $record.reactions = @{eyes=$reaction.eyes;paws=$reaction.paws}
        }
        $records += $record
        $proofs += $proof
        $entries += @{Path=$ase;Name=($style+'/'+$breed+'/'+$breed+'.aseprite')}
        $entries += @{Path=$original;Name=($style+'/'+$breed+'/original.png')}
        $entries += @{Path=$proofPath;Name=($style+'/'+$breed+'/conversion.json')}
    }
}
if (($Complete -or $Package) -and $pending.Count -gt 0) { throw ('All 60 style/breed sets must be complete: '+($pending -join ', ')) }
if (($Complete -or $Package) -and @($proofs | Where-Object { $_.outerMagentaCleanup.method -ne 'exterior-connected-saturated-magenta' -or -not $_.outerMagentaCleanup.afterRegistration }).Count -gt 0) { throw 'All native scene sets must finish the reviewed exterior key cleanup before packaging.' }
$generated = Join-Path $workspace 'frontend/src/lib/generated/sp-scene-assets.json'
$public = Join-Path $workspace 'local-assets/site/images/sp-scenes-v1/manifest.json'
$audit = Join-Path $workspace 'local-assets/work/sp-scenes-v1/preservation-audit.json'
[IO.Directory]::CreateDirectory((Split-Path -Parent $public)) | Out-Null
[IO.Directory]::CreateDirectory((Split-Path -Parent $audit)) | Out-Null
[IO.File]::WriteAllText($generated+'.tmp',(ConvertTo-Json -InputObject @($records) -Depth 10),$utf8)
[IO.File]::Move($generated+'.tmp',$generated,$true)
[IO.File]::WriteAllText($public,([ordered]@{version=1;complete=($pending.Count -eq 0);styles=@('sp08','sp15');breeds=$records}|ConvertTo-Json -Depth 12),$utf8)
[IO.File]::WriteAllText($audit,([ordered]@{sets=$records.Count;scenes=$records.Count*6;frames=$records.Count*16;complete=($pending.Count -eq 0);pending=$pending;resized=$false;quantized=$false;recolored=$false;fabricatedFrames=$false;retainedArtworkRgbaUnchanged=$true;assets=$proofs}|ConvertTo-Json -Depth 14),$utf8)
$inventory = @($records | ForEach-Object { $spRecord=$_; foreach ($scene in @('idle','side','walk','happy','sleep','wag')) { $spPath=$spRecord.scenes.$scene.png; $spFile=Join-Path $workspace ('local-assets/site'+$spPath); [ordered]@{style=$spRecord.style;breed=$spRecord.breed;scene=$scene;path=$spPath;bytes=(Get-Item -LiteralPath $spFile).Length;sha256=(Get-FileHash -LiteralPath $spFile).Hash} } })
[IO.File]::WriteAllText((Join-Path $workspace 'local-assets/work/sp-scenes-v1/site-assets-inventory.json'),([ordered]@{complete=($pending.Count -eq 0);images=$inventory.Count;expectedImages=$breedIds.Count*2*6;assets=$inventory}|ConvertTo-Json -Depth 6),$utf8)
if ($Package) {
    $readme = Join-Path $workspace 'local-assets/work/sp-scenes-v1/README.txt'
    [IO.File]::WriteAllText($readme,@'
PuppyRuby - SP08 Mong-sil and SP15 Pocket Bell breed scenes

Two selected styles, 30 registered breeds per style, six scenes per breed.
The SP08 and SP15 archives are separate; each archive contains one full style.
Every set includes the untouched generated original.png, an editable 32-bit
RGBA Aseprite master, six PNG strips, and a pixel-preservation conversion report.

Timeline (one-based): idle 1, side 2, happy 3, sleep 4, walk 5-12, wag 13-16.
walk.png contains eight native frames at 125 ms. wag.png contains four native
frames at 150 ms. All other scene strips contain one frame.

Native source artwork retains its full resolution and visible RGBA values.
No resampling, palette quantization, recoloring, or fabricated motion frames.
Only an explicitly configured background key is removed; transparent padding
and integer translations register source cells without changing artwork.
The saturated magenta fringe is removed only when connected to the outside
through transparent pixels. Exact removal masks are recorded per native frame;
all remaining RGBA values and integer placements are unchanged.

See manifest.json for canvas sizes and preservation-audit.json for SHA-256 hashes.
'@,$utf8)
    foreach ($style in @('sp08','sp15')) {
        $styleRecords = @($records | Where-Object {$_.style -eq $style})
        $styleProofs = @($proofs | Where-Object {$_.style -eq $style})
        $styleManifest = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$style+'/manifest.json')
        $styleAudit = Join-Path $workspace ('local-assets/work/sp-scenes-v1/'+$style+'/preservation-audit.json')
        [IO.File]::WriteAllText($styleManifest,([ordered]@{version=1;style=$style;complete=$true;breeds=$styleRecords}|ConvertTo-Json -Depth 12),$utf8)
        [IO.File]::WriteAllText($styleAudit,([ordered]@{style=$style;sets=30;scenes=180;frames=480;assets=$styleProofs}|ConvertTo-Json -Depth 14),$utf8)
        $styleEntries = @($entries | Where-Object {$_.Name.StartsWith($style+'/')})
        $styleEntries += @{Path=$styleManifest;Name='manifest.json'}
        $styleEntries += @{Path=$styleAudit;Name='preservation-audit.json'}
        $styleEntries += @{Path=$readme;Name='README.txt'}
        $zip = Join-Path $workspace ('local-assets/site/downloads/puppyruby-'+$style+'-breed-scenes.zip')
        $staged = Join-Path (Split-Path -Parent $zip) ('sp-scenes-'+[guid]::NewGuid().ToString('N')+'.zip')
        $archive = [IO.Compression.ZipFile]::Open($staged,[IO.Compression.ZipArchiveMode]::Create)
        try { foreach ($entry in $styleEntries) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.Path,$entry.Name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null } }
        finally { $archive.Dispose() }
        $archive = [IO.Compression.ZipFile]::OpenRead($staged)
        try {
            if ($archive.Entries.Count -ne 273) { throw 'Style package entry count does not match 30 completed breeds.' }
            foreach ($entry in $styleEntries) {
                $member = $archive.GetEntry($entry.Name)
                if ($null -eq $member -or $member.Length -ne (Get-Item -LiteralPath $entry.Path).Length) { throw ('Package entry failed verification: '+$entry.Name) }
            }
        } finally { $archive.Dispose() }
        [IO.File]::Move($staged,$zip,$true)
    }
}
[ordered]@{sets=$records.Count;scenes=$records.Count*6;frames=$records.Count*16;complete=($pending.Count -eq 0);pending=$pending;manifest=$generated;packaged=[bool]$Package} | ConvertTo-Json -Depth 3 -Compress
