param([string[]]$Ids,[ValidateSet('light','dark')][string]$Theme='light',[string]$OutputName='contact-sheet.png',[string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Ids){$Ids=@('marshmallow','milkbean','honeybun','cloudpuff','biscuit','naploaf','teddycub','peachcheek','buttonpaw','rounddrop','cottonball','caramel')|ForEach-Object{'premium-'+$_}}
foreach($id in $Ids){if($id -notmatch '^premium-(marshmallow|milkbean|honeybun|cloudpuff|biscuit|naploaf|teddycub|peachcheek|buttonpaw|rounddrop|cottonball|caramel)$'){throw 'Unknown premium sprite ID.'}}
if($OutputName -notmatch '^[a-z0-9-]+\.png$'){throw 'OutputName must be a simple PNG filename.'}
$output=Join-Path $workspace ('local-assets/work/premium-puppies-v1/'+$OutputName)
$sourceDirectory=Join-Path $workspace 'local-assets/site/downloads/premium-puppies-v1'
$before=@{};foreach($id in $Ids){$before[$id]=(Get-FileHash -LiteralPath (Join-Path $sourceDirectory ($id+'.aseprite'))).Hash}
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Aseprite;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($argument in @('--batch','--script-param',('input='+$sourceDirectory),'--script-param',('output='+$output),'--script-param',('ids='+($Ids -join ',')),'--script-param',('theme='+$Theme),'--script',(Join-Path $PSScriptRoot 'aseprite/compose-premium-puppies.lua'))){$start.ArgumentList.Add($argument)}
$process=[Diagnostics.Process]::Start($start);$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();$process.WaitForExit()
$code=$process.ExitCode;$log=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult();$process.Dispose()
[IO.File]::WriteAllText(($output+'.log'),$log,[Text.UTF8Encoding]::new($false))
if($code -ne 0 -or -not(Test-Path -LiteralPath $output)){throw 'Aseprite contact sheet failed; inspect its log.'}
foreach($id in $Ids){if((Get-FileHash -LiteralPath (Join-Path $sourceDirectory ($id+'.aseprite'))).Hash -ne $before[$id]){throw 'A contact-sheet operation changed a saved master.'}}
[PSCustomObject]@{count=$Ids.Count;contactSheet=$output;theme=$Theme;mastersUnchanged=$true}|ConvertTo-Json -Compress
