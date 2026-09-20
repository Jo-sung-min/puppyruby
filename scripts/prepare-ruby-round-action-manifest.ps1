param([switch]$Complete, [ValidateSet('v2','v3')][string]$SourceVersion = 'v3')
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$contract = Get-Content -LiteralPath (Join-Path $workspace 'shared/ruby-round-actions.json') -Raw | ConvertFrom-Json
$breedIds = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
$generatedPath = Join-Path $workspace 'frontend/src/lib/generated/ruby-round-scene-assets.json'
if ($SourceVersion -eq 'v3') {
    # A redraw is one complete release. Never merge new anatomy with old records,
    # and do not touch any registered manifest while a single breed is missing.
    $proofPaths = @($breedIds | ForEach-Object { Join-Path $workspace ('local-assets/work/ruby-round-v3/processed/' + $_ + '/motion-conversion.json') })
    $missing = @($proofPaths | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
    if ($breedIds.Count -ne 30 -or $missing.Count) { throw ('All 30 independently redrawn breeds are required before registration. Missing: ' + ($missing -join ', ')) }
    $verificationReportPath = Join-Path $workspace ('local-assets/work/ruby-round-v3/verification-' + [Guid]::NewGuid().ToString('N') + '.json')
    try {
        & node (Join-Path $PSScriptRoot 'verify-ruby-round-action-assets.cjs') --source-version=v3 --staged --require-visual-review ('--verification-report=' + $verificationReportPath)
        if ($LASTEXITCODE -ne 0) { throw 'Independent redraw source, editable master, visual review, and staged asset verification failed.' }
        $verified = Get-Content -LiteralPath $verificationReportPath -Raw | ConvertFrom-Json
        if ($verified.version -ne 1 -or -not $verified.complete -or -not $verified.visualReviewRequired -or -not $verified.staged -or $verified.sourceVersion -ne 3) { throw 'Incomplete redraw verification report.' }
    } finally {
        if (Test-Path -LiteralPath $verificationReportPath -PathType Leaf) { Remove-Item -LiteralPath $verificationReportPath }
    }
    $records = @(); $inventory = @(); $downloads = @()
    $desktopMetaPath = Join-Path $workspace 'frontend/src/lib/generated/desktop-appearance-assets.json'
    $desktopMeta = Get-Content -LiteralPath $desktopMetaPath -Raw | ConvertFrom-Json -AsHashtable
    # Pixel audits can contain millions of edit objects. The verifier above has
    # already checked them; only the small registration fields belong in PS.
    # Read each large proof in a short-lived Node process so old audit objects
    # cannot accumulate in PowerShell's object model across thirty breeds.
    $readManifestMetadata = @'
const fs = require('node:fs'), path = require('node:path');
const directory = process.argv[1], fields = ['width','height','aseprite','asepriteSha256','scenes','actions','pngSha256'];
const read = name => { const source = JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')); return Object.fromEntries(fields.map(key => [key,source[key]])); };
process.stdout.write(JSON.stringify({proof:read('motion-conversion.json'),core:read('conversion.json')}));
'@
    foreach ($breed in $breedIds) {
        $directory = Join-Path $workspace ('local-assets/work/ruby-round-v3/processed/' + $breed)
        $metadataJson = & node -e $readManifestMetadata $directory
        if ($LASTEXITCODE -ne 0 -or -not $metadataJson) { throw ('Could not read verified redraw registration fields: ' + $breed) }
        $metadata = ($metadataJson -join '') | ConvertFrom-Json
        $proof = $metadata.proof; $core = $metadata.core
        foreach ($action in $contract.actions) {
            $id = $action.id; $entry = $proof.actions.$id
            $variants = if ($id -in @('idle','side','walk','happy','sleep')) { @('','-default','-desktop') } else { @('') }
            foreach ($suffix in $variants) {
                $url = if ($suffix) { '/images/ruby-round-v1/' + $breed + '/' + $id + $suffix + '.png' } else { $entry.png }
                $local = Join-Path $workspace ('local-assets/site' + $url)
                $hash = $proof.pngSha256.($id + $suffix).ToLowerInvariant()
                $bytes = (Get-Item -LiteralPath $local).Length
                $frames = if ($suffix -eq '-desktop' -and $id -ne 'walk') { 1 } else { 4 }
                $inventory += [ordered]@{path=$url;sha256=$hash;bytes=$bytes}
                $desktopMeta[$url] = [ordered]@{sha256=$hash;width=$proof.width*$frames;height=$proof.height;bytes=$bytes}
            }
        }
        foreach ($master in @($core,$proof)) {
            $local = Join-Path $workspace ('local-assets/site' + $master.aseprite)
            $downloads += [ordered]@{path=$master.aseprite;sha256=$master.asepriteSha256.ToLowerInvariant();bytes=(Get-Item -LiteralPath $local).Length}
        }
        $records += [ordered]@{assetVersion=3;breed=$breed;width=$proof.width;height=$proof.height;aseprite=$core.aseprite;motionAseprite=$proof.aseprite;scenes=$proof.scenes;actions=$proof.actions}
    }
    foreach ($index in 1..30) {
        $url = '/images/ruby-round-v1/eyes/eye-{0:d2}.png' -f $index
        $local = Join-Path $workspace ('local-assets/site' + $url)
        $hash = (Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash.ToLowerInvariant()
        $bytes = (Get-Item -LiteralPath $local).Length
        $inventory += [ordered]@{path=$url;sha256=$hash;bytes=$bytes}
        $desktopMeta[$url] = [ordered]@{sha256=$hash;width=32;height=16;bytes=$bytes}
    }
    $eyeMaster = '/downloads/ruby-round-v1/ruby-round-eyes.aseprite'
    $eyeLocal = Join-Path $workspace ('local-assets/site' + $eyeMaster)
    $downloads += [ordered]@{path=$eyeMaster;sha256=(Get-FileHash -LiteralPath $eyeLocal -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $eyeLocal).Length}
    if ($inventory.Count -ne 810 -or $downloads.Count -ne 61) { throw 'Redrawn release must retain exactly 871 base files.' }
    $outputs = [ordered]@{}
    $outputs[$generatedPath] = ConvertTo-Json -InputObject @($records) -Depth 24
    $outputs[$desktopMetaPath] = $desktopMeta | ConvertTo-Json -Depth 10
    $outputs[(Join-Path $workspace 'local-assets/site/images/ruby-round-v1/actions-manifest.json')] = [ordered]@{schemaVersion=3;complete=$true;actions=$contract.actions;breeds=$records;pending=@()} | ConvertTo-Json -Depth 25
    $outputs[(Join-Path $workspace 'local-assets/site/images/ruby-round-v1/manifest.json')] = [ordered]@{version=3;complete=$true;breeds=$records;pending=@()} | ConvertTo-Json -Depth 25
    $outputs[(Join-Path $workspace 'local-assets/work/ruby-round-v3/site-assets-inventory.json')] = [ordered]@{complete=$true;images=$inventory.Count;downloads=$downloads.Count;assets=$inventory;downloadAssets=$downloads} | ConvertTo-Json -Depth 10
    $utf8 = [Text.UTF8Encoding]::new($false)
    # Every input and every JSON serialization has passed before the first write.
    # A concurrent reimport invalidates the reviewed source/master/panels as one
    # unit; registration must not mix inputs from before and after inspection.
    foreach ($inputFile in $verified.inputs) {
        $inputPath = [IO.Path]::GetFullPath((Join-Path $workspace $inputFile.path))
        if (-not $inputPath.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
            (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash -ne $inputFile.sha256) {
            throw ('A verified redraw input changed before registration: ' + $inputFile.path)
        }
    }
    foreach ($target in $outputs.Keys) { [IO.File]::WriteAllText($target + '.tmp',$outputs[$target],$utf8) }
    foreach ($target in $outputs.Keys) { [IO.File]::Move($target + '.tmp',$target,$true) }
    [ordered]@{complete=$true;sourceVersion=3;breeds=30;actions=480;frames=1920;images=810;downloads=61} | ConvertTo-Json -Compress
    return
}
$coreRecords = @(Get-Content -LiteralPath $generatedPath -Raw | ConvertFrom-Json)
$coreByBreed = @{}; foreach ($record in $coreRecords) { $coreByBreed[$record.breed] = $record }
$desktopMetaPath = Join-Path $workspace 'frontend/src/lib/generated/desktop-appearance-assets.json'
$desktopMeta = Get-Content -LiteralPath $desktopMetaPath -Raw | ConvertFrom-Json -AsHashtable
$records = @(); $pending = @(); $inventory = @(); $downloads = @()
foreach ($breed in $breedIds) {
    $core = $coreByBreed[$breed]
    $proofPath = Join-Path $workspace ('local-assets/work/ruby-round-v2/processed/' + $breed + '/motion-conversion.json')
    if ($null -eq $core -or -not (Test-Path -LiteralPath $proofPath -PathType Leaf)) { $pending += $breed; if ($null -ne $core) { $records += $core }; continue }
    $proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
    $invalidMaster = (
        $proof.breed -ne $breed -or
        $proof.version -ne 2 -or
        $proof.frames -ne 64 -or
        $proof.framesPerAction -ne 4 -or
        $proof.eyeStyles -ne 30 -or
        $proof.width -ne $core.width -or
        $proof.height -ne $core.height -or
        $proof.actionOrder.Count -ne 16 -or
        $proof.editableLayers -ne 32 -or
        -not $proof.integerMotionOnly -or
        -not $proof.legacyFramesPreserved -or
        -not $proof.sourceAsepriteSha256 -or
        -not $proof.sourceProofSha256
    )
    if ($invalidMaster) { throw ('Unverified action master ' + $breed) }
    if (($proof.actionOrder -join '|') -ne (($contract.actions | ForEach-Object id) -join '|')) { throw ('Action order mismatch ' + $breed) }
    foreach ($action in $contract.actions) {
        $motion = $proof.actions.($action.id)
        if ($null -eq $motion -or $motion.frames -ne 4 -or $motion.frameMs -ne $action.frameMs -or $motion.eyeMode -ne $action.eyeMode -or $motion.eyes.Count -ne 4) { throw ('Action contract mismatch ' + $breed + '/' + $action.id) }
        if ($action.kind -eq 'legacy') {
            if ($motion.png -ne $core.scenes.($action.id).png) { throw ('Legacy action path changed ' + $breed + '/' + $action.id) }
            continue
        }
        $local = Join-Path $workspace ('local-assets/site' + $motion.png)
        $hash = $proof.pngSha256.($action.id)
        if (-not (Test-Path -LiteralPath $local -PathType Leaf) -or (Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash -ne $hash) { throw ('Published action hash mismatch ' + $breed + '/' + $action.id) }
        $bytes = (Get-Item -LiteralPath $local).Length
        $inventory += [ordered]@{path=$motion.png;sha256=$hash.ToLowerInvariant();bytes=$bytes}
        $desktopMeta[$motion.png] = [ordered]@{sha256=$hash.ToLowerInvariant();width=$proof.width*4;height=$proof.height;bytes=$bytes}
    }
    $master = Join-Path $workspace ('local-assets/site' + $proof.aseprite)
    if (-not (Test-Path -LiteralPath $master -PathType Leaf) -or (Get-FileHash -LiteralPath $master -Algorithm SHA256).Hash -ne $proof.asepriteSha256) { throw ('Published 16-action Aseprite mismatch ' + $breed) }
    $downloads += [ordered]@{path=$proof.aseprite;sha256=$proof.asepriteSha256.ToLowerInvariant();bytes=(Get-Item -LiteralPath $master).Length}
    $records += [ordered]@{breed=$breed;width=$core.width;height=$core.height;aseprite=$core.aseprite;motionAseprite=$proof.aseprite;scenes=$core.scenes;actions=$proof.actions}
}
if ($Complete -and $pending.Count) { throw ('Missing registered 16-action breeds: ' + ($pending -join ', ')) }
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($generatedPath,(ConvertTo-Json -InputObject @($records) -Depth 16),$utf8)
[IO.File]::WriteAllText($desktopMetaPath,($desktopMeta | ConvertTo-Json -Depth 8),$utf8)
$manifestPath = Join-Path $workspace 'local-assets/site/images/ruby-round-v1/actions-manifest.json'
[IO.Directory]::CreateDirectory((Split-Path -Parent $manifestPath)) | Out-Null
[IO.File]::WriteAllText($manifestPath,([ordered]@{schemaVersion=2;complete=($pending.Count -eq 0);actions=$contract.actions;breeds=$records;pending=$pending} | ConvertTo-Json -Depth 17),$utf8)
$workInventory = Join-Path $workspace 'local-assets/work/ruby-round-v2/site-assets-inventory.json'
[IO.Directory]::CreateDirectory((Split-Path -Parent $workInventory)) | Out-Null
[IO.File]::WriteAllText($workInventory,([ordered]@{complete=($pending.Count -eq 0);images=$inventory.Count;downloads=$downloads.Count;assets=$inventory;downloadAssets=$downloads} | ConvertTo-Json -Depth 8),$utf8)
[ordered]@{complete=($pending.Count -eq 0);breeds=$records.Count;actions=$records.Count*16;frames=$records.Count*64;newImages=$inventory.Count;newDownloads=$downloads.Count;pending=$pending} | ConvertTo-Json -Compress
