param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicDirectory = Join-Path $workspace 'local-assets/site'
$processedDirectory = Join-Path $workspace 'local-assets/work/soft-pixel-v1/processed'
$destination = Join-Path $publicDirectory 'downloads/puppyruby-soft-pixel-candidates.zip'
$entries = [Collections.Generic.List[object]]::new()
$reports = [Collections.Generic.List[object]]::new()
foreach ($number in 1..15) {
    $id = 'sp-{0:d2}' -f $number
    $proofPath = Join-Path $processedDirectory ($id+'/conversion.json')
    $proof = [IO.File]::ReadAllText($proofPath) | ConvertFrom-Json
    if ($proof.id -ne $id -or $proof.width -ne 192 -or $proof.height -ne 192 -or -not $proof.sourcePreserved -or -not $proof.exactExportRgba -or $proof.editableEyeLayers -ne 12 -or $proof.defaultEyes -ne 'bean') { throw ('Candidate failed its editable-art checks: '+$id) }
    foreach ($name in @('body','eyes-dot','eyes-bean','eyes-sparkle','eyes-sleep','preview')) {
        $path = Join-Path $publicDirectory ('images/soft-pixel-v1/'+$id+'/'+$name+'.png')
        if ((Get-FileHash -LiteralPath $path).Hash -ne $proof.pngSha256.$name) { throw ('Published PNG differs from verified Aseprite export: '+$id+'/'+$name) }
        $entries.Add(@{Path=$path;Name=($id+'/'+$name+'.png')})
    }
    $ase = Join-Path $publicDirectory ('downloads/soft-pixel-v1/'+$id+'.aseprite')
    if ((Get-FileHash -LiteralPath $ase).Hash -ne $proof.asepriteSha256) { throw ('Published editable master differs from verified import: '+$id) }
    $entries.Add(@{Path=$ase;Name=($id+'/'+$id+'.aseprite')})
    $entries.Add(@{Path=$proofPath;Name=($id+'/conversion.json')})
    $original = Join-Path $workspace ('local-assets/work/soft-pixel-v1/originals/'+$id+'.png')
    if ((Get-FileHash -LiteralPath $original).Hash -ne $proof.sourceSha256) { throw ('Preserved original differs from the imported artwork: '+$id) }
    $entries.Add(@{Path=$original;Name=($id+'/original.png')})
    $reports.Add($proof)
}
if (-not $VerifyOnly) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $staged = Join-Path (Split-Path -Parent $destination) ('soft-pixel-candidates-'+[guid]::NewGuid().ToString('N')+'.zip')
    $archive = [IO.Compression.ZipFile]::Open($staged,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in $entries) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$entry.Path,$entry.Name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null }
        $readme = $archive.CreateEntry('README.txt')
        $writer = [IO.StreamWriter]::new($readme.Open(),[Text.UTF8Encoding]::new($false))
        try {
            $writer.Write("PuppyRuby - 15 soft pixel style candidates`n`nEach 192 x 192 candidate includes its editable Aseprite master, a separate body PNG, four aligned eye PNGs, the default preview, and the untouched high-resolution generated original.png.`n`nOpen sp-NN.aseprite in Aseprite. The Body layer contains the supplied artwork. Toggle exactly one Eyes group: dot, bean (default), sparkle, or sleep. Each group contains Eye left, Eye right, and Highlights layers, so eye position, pupil color, and expression can be edited separately.`n`nPNG exports use true transparency and matching 192 x 192 canvases. Composite body.png and one eyes-*.png at the same origin. preview.png is body.png plus eyes-bean.png. Black eye pixels may be tinted; white highlights stay white. original.png retains the full source resolution without resampling or background cleanup; it intentionally has no eyes so the supplied body remains independent of replaceable expressions.`n`nThese are style candidates for comparison, not 30 completed breed sets.`n")
        } finally { $writer.Dispose() }
    } finally { $archive.Dispose() }
    $zip = [IO.Compression.ZipFile]::OpenRead($staged)
    try {
        if ($zip.Entries.Count -ne 136) { throw 'Package is missing required artwork or source metadata.' }
        foreach ($entry in $entries) {
            $member = $zip.GetEntry($entry.Name)
            if ($null -eq $member -or $member.Length -ne (Get-Item -LiteralPath $entry.Path).Length) { throw 'Package entry failed its length check.' }
        }
    } finally { $zip.Dispose() }
    # Only this generated, workspace-owned download is replaced after validation.
    [IO.File]::Move($staged,$destination,$true)
}
[ordered]@{candidates=15;pngs=90;originals=15;editableMasters=15;eyePresets=4;eyeLayersPerCandidate=12;packageEntries=136;verified=$true;package=('/downloads/'+[IO.Path]::GetFileName($destination));created=(-not [bool]$VerifyOnly)} | ConvertTo-Json -Compress
