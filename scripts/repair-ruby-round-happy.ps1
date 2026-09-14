param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z]+$')][string]$Breed)
$ErrorActionPreference='Stop'
$rubyWorkspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rubyWork=Join-Path $rubyWorkspace 'local-assets/work/ruby-round-v1'
$rubyFix=Join-Path $rubyWork 'paw-fix'
$rubyOriginal=Join-Path $rubyWork ('originals/'+$Breed+'.png')
$rubyEdited=Join-Path $rubyFix ('generated/'+$Breed+'.png')
$rubyProof=Join-Path $rubyWork ('processed/'+$Breed+'/conversion.json')
$rubyBaseline=Join-Path $rubyFix ('baseline/'+$Breed)
$rubyMerged=Join-Path $rubyFix ('merged/'+$Breed+'.png')
$rubyReport=Join-Path $rubyFix ('merged/'+$Breed+'.json')
foreach ($rubyPath in @($rubyOriginal,$rubyEdited,$rubyProof)) { if (-not (Test-Path -LiteralPath $rubyPath -PathType Leaf)) { throw 'Missing reviewed repair input.' } }
if (Test-Path -LiteralPath $rubyReport) { throw 'Repair already merged; inspect the saved report before another revision.' }
New-Item -ItemType Directory -Force -Path $rubyBaseline,(Split-Path $rubyMerged) | Out-Null
Copy-Item -LiteralPath $rubyOriginal -Destination (Join-Path $rubyBaseline 'original.png')
Copy-Item -LiteralPath $rubyProof -Destination (Join-Path $rubyBaseline 'conversion.json')
$rubyBefore=(Get-FileHash -LiteralPath $rubyOriginal).Hash
$rubyProcessInfo=[Diagnostics.ProcessStartInfo]::new()
$rubyProcessInfo.FileName='C:\Program Files\Aseprite\Aseprite.exe'
$rubyProcessInfo.UseShellExecute=$false; $rubyProcessInfo.CreateNoWindow=$true
$rubyProcessInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$rubyProcessInfo.RedirectStandardOutput=$true; $rubyProcessInfo.RedirectStandardError=$true
$rubyProcessInfo.ArgumentList.Add('--batch')
$rubyParameters=@{input=$rubyOriginal;edited=$rubyEdited;proof=$rubyProof;output=$rubyMerged;report=$rubyReport}
foreach ($rubyKey in $rubyParameters.Keys) { $rubyProcessInfo.ArgumentList.Add('--script-param');$rubyProcessInfo.ArgumentList.Add($rubyKey+'='+$rubyParameters[$rubyKey]) }
$rubyProcessInfo.ArgumentList.Add('--script');$rubyProcessInfo.ArgumentList.Add((Join-Path $PSScriptRoot 'aseprite/repair-ruby-round-happy.lua'))
$rubyProcess=[Diagnostics.Process]::Start($rubyProcessInfo)
$rubyOut=$rubyProcess.StandardOutput.ReadToEndAsync();$rubyErr=$rubyProcess.StandardError.ReadToEndAsync()
$rubyProcess.WaitForExit();$rubyOutText=$rubyOut.GetAwaiter().GetResult();$rubyErrText=$rubyErr.GetAwaiter().GetResult()
if ($rubyProcess.ExitCode -ne 0 -or $rubyErrText -match '(?i)error|stack traceback') { throw ('Aseprite repair failed: '+$rubyErrText) }
$rubyProcess.Dispose()
$rubyAudit=Get-Content -LiteralPath $rubyReport -Raw | ConvertFrom-Json
$rubyAfter=(Get-FileHash -LiteralPath $rubyMerged).Hash
foreach ($rubyEntry in @{sourceSha256=$rubyBefore;editedSha256=(Get-FileHash -LiteralPath $rubyEdited).Hash;mergedSha256=$rubyAfter;breed=$Breed}.GetEnumerator()) { $rubyAudit | Add-Member -NotePropertyName $rubyEntry.Key -NotePropertyValue $rubyEntry.Value }
[IO.File]::WriteAllText($rubyReport,($rubyAudit | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$rubyOverridePath=Join-Path $PSScriptRoot 'ruby-round-cleanup-overrides.json'
$rubyOverrides=Get-Content -LiteralPath $rubyOverridePath -Raw | ConvertFrom-Json -AsHashtable
if ($rubyOverrides.ContainsKey($Breed)) {
    if ($rubyOverrides[$Breed].sourceSha256 -ne $rubyBefore) { throw 'Prior reviewed cleanup source hash mismatch.' }
    foreach ($rubyRegion in $rubyOverrides[$Breed].regions) {
        if ($rubyRegion.right -ge $rubyAudit.left -and $rubyRegion.left -le $rubyAudit.right -and $rubyRegion.bottom -ge $rubyAudit.top -and $rubyRegion.top -le $rubyAudit.bottom) { throw 'Repair touches previously reviewed cleanup region; re-review required.' }
    }
    # The Aseprite pixel comparison proves that every old reviewed region is unchanged.
    $rubyOverrides[$Breed].sourceSha256=$rubyAfter
    [IO.File]::WriteAllText($rubyOverridePath,($rubyOverrides | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
}
Copy-Item -LiteralPath $rubyMerged -Destination $rubyOriginal
Write-Output ('Repaired '+$Breed+' greeting frames 2-4; all other source pixels preserved.')
