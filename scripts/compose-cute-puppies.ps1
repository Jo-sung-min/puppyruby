param([string[]]$Ids,[string]$OutputName='contact-sheet.png',[string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Ids){$Ids=@();foreach($family in @('cozy','bean','bright','button')){foreach($body in @('chubby','slim','tall','loaf')){$Ids+=($family+'-'+$body)}}}
foreach($id in $Ids){if($id -notmatch '^(cozy|bean|bright|button)-(chubby|slim|tall|loaf)$'){throw 'Unknown sprite id.'}}
if($OutputName -notmatch '^[a-z0-9-]+\.png$'){throw 'OutputName must be a simple PNG filename.'}
$output=Join-Path $workspace ('local-assets/work/cute-puppies-v1/'+$OutputName)
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Aseprite;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('--batch','--script-param',('input='+(Join-Path $workspace 'local-assets/site/downloads/cute-puppies-v1')),'--script-param',('output='+$output),'--script-param',('ids='+($Ids -join ',')),'--script',(Join-Path $PSScriptRoot 'aseprite/compose-cute-puppies.lua'))){$start.ArgumentList.Add($arg)}
$p=[Diagnostics.Process]::Start($start);$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync();$p.WaitForExit()
$code=$p.ExitCode;$log=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult();$p.Dispose()
[IO.File]::WriteAllText(($output+'.log'),$log,[Text.UTF8Encoding]::new($false))
if($code -ne 0 -or -not(Test-Path -LiteralPath $output)){throw 'Aseprite contact sheet failed; inspect its log.'}
[PSCustomObject]@{count=$Ids.Count;contactSheet=$output}|ConvertTo-Json -Compress
