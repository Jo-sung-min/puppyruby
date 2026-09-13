param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$assetWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$assetStorage = [IO.Path]::GetFullPath((Join-Path $assetWorkspace 'local-assets'))
$assetJournalPath = Join-Path $assetStorage 'migration.json'
$assetMappings = @(
    @('frontend/public/images', 'site/images'),
    @('frontend/public/downloads', 'site/downloads'),
    @('frontend/public/favicon.svg', 'site/favicon.svg'),
    @('docs/previews', 'site/images/docs-previews'),
    @('.playwright-mcp', 'references/browser-captures'),
    @('output', 'work'),
    @('desktop/build', 'desktop/build'),
    @('desktop/dist', 'desktop/dist')
)
$assetJournal = @()
if (Test-Path -LiteralPath $assetJournalPath) { $assetJournal = @(Get-Content -Raw -LiteralPath $assetJournalPath | ConvertFrom-Json) }
function Get-AssetInventory([string]$Root) {
    $item = Get-Item -LiteralPath $Root -Force
    $entries = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $Root -Recurse -Force) } else { @($item) }
    if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw 'Asset source contains a reparse point.' }
    return @($entries | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName | ForEach-Object {
        [ordered]@{ path = if ($item.PSIsContainer) { [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\','/') } else { '.' }; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
}
foreach ($mapping in $assetMappings) {
    $source = [IO.Path]::GetFullPath((Join-Path $assetWorkspace $mapping[0]))
    $destination = [IO.Path]::GetFullPath((Join-Path $assetStorage $mapping[1]))
    if (-not $source.StartsWith($assetWorkspace + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($assetStorage + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Asset path leaves the intended workspace.' }
    $completed = @($assetJournal | Where-Object { $_.source -eq $mapping[0] -and $_.verified })
    if (-not (Test-Path -LiteralPath $source)) {
        if ($completed.Count -eq 1 -and (Test-Path -LiteralPath $destination)) { continue }
        if (-not (Test-Path -LiteralPath $destination)) { continue }
        throw ('Unrecorded destination already exists: ' + $mapping[1])
    }
    if ((Get-Item -LiteralPath $source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source root is a reparse point.' }
    if (Test-Path -LiteralPath $destination) { throw ('Destination already exists: ' + $mapping[1]) }
    Write-Output ('Inventory: ' + $mapping[0])
    $before = @(Get-AssetInventory $source)
    if (-not $Apply) { Write-Output ('PLAN ' + $mapping[0] + ' -> local-assets/' + $mapping[1] + ' (' + $before.Count + ' files)'); continue }
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    # Both resolved absolute targets were checked against the workspace above.
    Move-Item -LiteralPath $source -Destination $destination -ErrorAction Stop
    $after = @(Get-AssetInventory $destination)
    if (($before | ConvertTo-Json -Depth 4 -Compress) -ne ($after | ConvertTo-Json -Depth 4 -Compress)) { throw ('Asset content mismatch after move: ' + $mapping[0]) }
    $assetJournal += [ordered]@{ source = $mapping[0]; destination = 'local-assets/' + $mapping[1]; verified = $true; files = $after; movedAt = [DateTime]::UtcNow.ToString('o') }
    $assetJournal | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $assetJournalPath -Encoding UTF8
    Write-Output ('VERIFIED ' + $mapping[0] + ' -> local-assets/' + $mapping[1] + ' (' + $after.Count + ' files)')
}
