param(
    [string[]]$Breeds,
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [string]$ReviewedSettings,
    [switch]$InspectOnly,
    [switch]$Reprocess
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work = Join-Path $workspace 'local-assets/work/ruby-round-v3'
$originals = Join-Path $work 'originals'
$registered = @([regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')), 'id: "([a-z]+)"') | ForEach-Object { $_.Groups[1].Value })
if (-not $ReviewedSettings) { $ReviewedSettings = Join-Path $work 'reviewed-import-settings.json' }
# Optional settings are reviewed against exact source bytes; the batch never
# increases cleanup tolerance in response to an import failure.
# {"poodle":{"sourceSha256":"...","fringeAlphaMax":27,"anchors":"..."}}
$settings = @{}
if (Test-Path -LiteralPath $ReviewedSettings -PathType Leaf) { $settings = Get-Content -LiteralPath $ReviewedSettings -Raw | ConvertFrom-Json -AsHashtable }
if (-not $Breeds) {
    $available = @(Get-ChildItem -LiteralPath $originals -File -Filter '*.png' | ForEach-Object { $_.BaseName })
    $Breeds = @($registered | Where-Object { $available -contains $_ })
}
$results = @()
function Get-SourceGutterReview([string]$Path) {
    Add-Type -AssemblyName System.Drawing
    $bitmap = [Drawing.Bitmap]::new($Path)
    function Get-Gutters($Vertical,$From,$To) {
        $length = if ($Vertical) { $bitmap.Width } else { $bitmap.Height }
        $lineMax = New-Object int[] $length
        for ($v=0; $v -lt $length; $v++) {
            $maximum=0
            for ($q=$From; $q -lt $To; $q++) {
                $alpha = if ($Vertical) { [int]$bitmap.GetPixel($v,$q).A } else { [int]$bitmap.GetPixel($q,$v).A }
                if ($alpha -gt $maximum) { $maximum=$alpha }
            }
            $lineMax[$v]=$maximum
        }
        $cuts=@(0); $stats=@()
        for ($n=1; $n -lt 8; $n++) {
            $center=[math]::Floor($length*$n/8); $radius=[math]::Floor($length/8*.45)
            $minimum=256; $position=0
            for ($v=[int]($center-$radius); $v -lt ($center+$radius); $v++) {
                $needed=[math]::Max($lineMax[$v],$lineMax[$v+1])
                if ($needed -lt $minimum) { $minimum=$needed; $position=$v }
            }
            $cuts+=$position+1
            $stats += [pscustomobject]@{ division=$n; position=$position; minimumAlpha=$minimum }
        }
        $cuts+=$length
        return @{ cuts=$cuts; stats=$stats }
    }
    try {
        $horizontal=Get-Gutters $false 0 $bitmap.Width
        $all=@($horizontal.stats | ForEach-Object { [pscustomobject]@{axis='row';row=0;division=$_.division;position=$_.position;minimumAlpha=$_.minimumAlpha} })
        for ($row=0; $row -lt 8; $row++) {
            $vertical=Get-Gutters $true $horizontal.cuts[$row] $horizontal.cuts[$row+1]
            $all+=@($vertical.stats | ForEach-Object { [pscustomobject]@{axis='column';row=$row+1;division=$_.division;position=$_.position;minimumAlpha=$_.minimumAlpha} })
        }
        return @($all | Sort-Object minimumAlpha -Descending | Select-Object -First 5)
    } finally { $bitmap.Dispose() }
}
foreach ($breed in $Breeds) {
    if ($registered -notcontains $breed) { throw ('Unknown registered breed: ' + $breed) }
    $source = Join-Path $originals ($breed + '.png')
    try {
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Source atlas has not arrived.' }
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($InspectOnly) {
            $results += [ordered]@{breed=$breed;status='source-inspected';sourceSha256=$hash;gutterReview=(Get-SourceGutterReview $source)}
            continue
        }
        $arguments = @{ Breed=$breed; InputPng=$source; Aseprite=$Aseprite; Background='transparent-artifacts' }
        if ($settings.ContainsKey($breed)) {
            $review = $settings[$breed]
            if (-not $review.sourceSha256 -or $review.sourceSha256 -ne $hash) { throw 'Reviewed import settings refer to a different source atlas.' }
            if ($review.ContainsKey('fringeAlphaMax')) { $arguments.FringeAlphaMax = [int]$review.fringeAlphaMax }
            if ($review.ContainsKey('reason')) { $arguments.FringeReviewReason = $review.reason }
            if ($review.ContainsKey('anchors')) { $arguments.Anchors = [IO.Path]::GetFullPath((Join-Path $work $review.anchors)) }
        }
        $proof = Join-Path $work ('processed/' + $breed + '/motion-conversion.json')
        if ($Reprocess) { $arguments.Reprocess = $true }
        elseif (Test-Path -LiteralPath $proof -PathType Leaf) { $arguments.VerifyExisting = $true }
        # Sequential imports avoid any race while creating the shared eye set.
        # This helper deliberately has no Publish option: outputs stay in v3.
        $output = & (Join-Path $PSScriptRoot 'import-ruby-round-redrawn.ps1') @arguments
        $summary = $output | Select-Object -Last 1 | ConvertFrom-Json
        $results += [ordered]@{ breed=$breed; status='verified'; frames=$summary.frames; width=$summary.width; height=$summary.height; sourceSha256=$hash }
    } catch {
        $failure=[ordered]@{ breed=$breed; status='needs-review'; error=$_.Exception.Message }
        $log=Join-Path $work ('processed/' + $breed + '/import-ruby-round-redrawn.lua.log')
        if ((Test-Path -LiteralPath $log) -and [IO.File]::ReadAllText($log).Contains('No clean source gutter')) { $failure.gutterReview=Get-SourceGutterReview $source }
        $results += $failure
    }
}
$pending = @($registered | Where-Object { -not (Test-Path -LiteralPath (Join-Path $work ('processed/' + $_ + '/motion-conversion.json')) -PathType Leaf) })
[ordered]@{ published=$false; processed=$results.Count; verified=@($results | Where-Object status -eq 'verified').Count; results=$results; pending=$pending } | ConvertTo-Json -Depth 6
