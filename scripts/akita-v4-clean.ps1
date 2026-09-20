param(
    [string]$Aseprite = 'C:\Program Files\Aseprite\Aseprite.exe',
    [ValidateRange(64,192)][int]$AlphaCutoff = 128
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceDirectory = Join-Path $workspace 'local-assets/work/ruby-round-v3/processed/akita'
$source = Join-Path $sourceDirectory 'akita-16-actions.aseprite'
$metadata = Join-Path $sourceDirectory 'motion-conversion.json'
$destination = Join-Path $workspace 'local-assets/work/ruby-round-v4/akita-trial/cleaned'
$script = Join-Path $PSScriptRoot 'aseprite/akita-v4-clean.lua'
foreach ($required in @($Aseprite,$source,$metadata,$script)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Required file missing: ' + $required) }
}
if (Test-Path -LiteralPath (Join-Path $destination 'akita-cleaned.aseprite')) {
    throw 'Trial master already exists and is preserved. Use another explicitly reviewed output stage for revisions.'
}
[IO.Directory]::CreateDirectory($destination) | Out-Null
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$metadataHash = (Get-FileHash -LiteralPath $metadata -Algorithm SHA256).Hash
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $Aseprite; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
$start.ArgumentList.Add('--batch')
foreach ($parameter in @("input=$source","metadata=$metadata","output=$destination","alphaCutoff=$AlphaCutoff")) {
    $start.ArgumentList.Add('--script-param'); $start.ArgumentList.Add($parameter)
}
$start.ArgumentList.Add('--script'); $start.ArgumentList.Add($script)
$process = [Diagnostics.Process]::Start($start)
$outTask = $process.StandardOutput.ReadToEndAsync(); $errTask = $process.StandardError.ReadToEndAsync()
$process.WaitForExit(); $stdout = $outTask.GetAwaiter().GetResult(); $stderr = $errTask.GetAwaiter().GetResult(); $code = $process.ExitCode
$process.Dispose()
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $destination 'aseprite-cleanup.log'),$stdout+$stderr,$utf8)
if ($code -ne 0 -or $stderr -match '(?i)error|stack traceback') { throw ('Aseprite cleanup failed: ' + $stderr) }
if ($sourceHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -or $metadataHash -ne (Get-FileHash -LiteralPath $metadata -Algorithm SHA256).Hash) {
    throw 'Original source or metadata changed unexpectedly.'
}
$audit = Get-Content -LiteralPath (Join-Path $destination 'cleanup-audit.json') -Raw | ConvertFrom-Json
if (-not $audit.savedMasterVerified -or -not $audit.sharedEyeLayersPreservedExceptFrame38 -or $audit.totals.afterPartial -ne 0) { throw 'Incomplete native master verification.' }
& (Join-Path $PSScriptRoot 'akita-v4-manifest.ps1') -OutputDirectory $destination
$hashes = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Extension -in @('.png','.gif','.aseprite') }) {
    $hashes[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$report = [ordered]@{ sourceMaster=$source; sourceSha256=$sourceHash.ToLowerInvariant(); metadataSha256=$metadataHash.ToLowerInvariant(); sourceUnchanged=$true; aseprite=$Aseprite; alphaCutoff=$AlphaCutoff; outputs=$hashes }
[IO.File]::WriteAllText((Join-Path $destination 'output-sha256.json'),($report | ConvertTo-Json -Depth 8),$utf8)
Write-Output $stdout
Write-Output ('Source unchanged. Trial output: ' + $destination)
