param([string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe',[string[]]$ExcludeBreeds=@())
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work=Join-Path $workspace 'local-assets/work/ruby-round-v3'
$output=Join-Path $work 'review'
[IO.Directory]::CreateDirectory($output) | Out-Null
$snapshots=Join-Path $output 'masters'
[IO.Directory]::CreateDirectory($snapshots) | Out-Null
$utf8=[Text.UTF8Encoding]::new($false)
$prior=@{}
$inventory=Join-Path $output 'review-inventory.json'
if(Test-Path -LiteralPath $inventory -PathType Leaf){
    $previous=Get-Content -LiteralPath $inventory -Raw | ConvertFrom-Json
    foreach($entry in $previous.breeds){$prior[$entry.breed]=$entry.masterSha256}
}
$actions=@('idle','side','walk','happy','sleep','typing','petting','eat','belly','stretch','wag','scratch','walk-left','walk-right','walk-up','walk-down')
$entries=@(Get-ChildItem -LiteralPath (Join-Path $work 'processed') -Directory | Sort-Object Name | ForEach-Object {
    if ($_.Name -in $ExcludeBreeds) { return }
    $master=Join-Path $_.FullName ($_.Name + '-16-actions.aseprite')
    $proof=Join-Path $_.FullName 'motion-conversion.json'
    if ((Test-Path -LiteralPath $master -PathType Leaf) -and (Test-Path -LiteralPath $proof -PathType Leaf)) {
        $hash=(Get-FileHash -LiteralPath $master -Algorithm SHA256).Hash.ToLowerInvariant()
        # Conversion proofs include every removed source pixel and can be tens of MB.
        # Read only the finalized master hash instead of materializing all pixel records.
        $proofHash=[regex]::Match([IO.File]::ReadAllText($proof),'"asepriteSha256"\s*:\s*"([a-f0-9]{64})"').Groups[1].Value
        if ($proofHash -ne $hash) { Write-Warning ('Skipping unfinished import: '+$_.Name);return }
        $snapshot=Join-Path $snapshots ($_.Name+'-'+$hash+'.aseprite')
        if (-not(Test-Path -LiteralPath $snapshot -PathType Leaf)) {
            Copy-Item -LiteralPath $master -Destination $snapshot
        }
        if ((Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
            Write-Warning ('Skipping master changed while taking snapshot: '+$_.Name);return
        }
        $reuse=$prior[$_.Name] -eq $hash
        foreach($action in $actions){if(-not(Test-Path -LiteralPath (Join-Path $output ($_.Name+'-'+$action+'.gif')) -PathType Leaf)){$reuse=$false}}
        [ordered]@{breed=$_.Name;master=$snapshot;sourceMaster=$master;masterSha256=$hash;reuseGifs=$reuse}
    }
})
if ($entries.Count -eq 0) { throw 'No completed redrawn master is ready for review.' }
$plan=Join-Path $output 'review-plan.json'
[IO.File]::WriteAllText($plan,(@{breeds=$entries} | ConvertTo-Json -Depth 5),$utf8)
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Aseprite;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($arg in @('--batch','--script-param',('plan='+$plan),'--script-param',('output='+$output),'--script',(Join-Path $PSScriptRoot 'aseprite/preview-ruby-round-redrawn.lua'))) {$start.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($start)
$outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
$process.WaitForExit();$stdout=$outTask.GetAwaiter().GetResult();$stderr=$errTask.GetAwaiter().GetResult();$code=$process.ExitCode;$process.Dispose()
[IO.File]::WriteAllText((Join-Path $output 'preview.log'),$stdout+$stderr,$utf8)
if($code -ne 0 -or $stderr -match '(?i)error|stack traceback') {throw ('Aseprite review export failed ('+$code+'): '+$stdout+$stderr)}
foreach($entry in $entries){
    $after=if(Test-Path -LiteralPath $entry.sourceMaster -PathType Leaf){(Get-FileHash -LiteralPath $entry.sourceMaster -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
    if($after -ne $entry.masterSha256){Write-Warning ('Master changed after snapshot; review is tied to old hash and requires refresh before approval: '+$entry.breed)}
}
$report=Get-Content -LiteralPath (Join-Path $output 'review-inventory.json') -Raw | ConvertFrom-Json
Write-Output ('Native review: '+$report.breeds.Count+' breeds, '+$report.pages.Count+' belly contact sheets, '+($report.breeds.Count*16)+' GIFs.')
foreach($breed in $report.breeds) {Write-Output ($breed.breed+': '+$breed.width+'x'+$breed.height+', cyan candidates strong='+$breed.cyanCandidates.strong+', fringe='+$breed.cyanCandidates.fringe)}
$actionCatalog=Get-Content -LiteralPath (Join-Path $workspace 'shared/ruby-round-actions.json') -Raw | ConvertFrom-Json
$displayNames=@{}
foreach($match in [regex]::Matches([IO.File]::ReadAllText((Join-Path $workspace 'frontend/src/lib/dog-breeds.ts')),'id: "([a-z]+)", name: "([^"]+)"')){$displayNames[$match.Groups[1].Value]=$match.Groups[2].Value}
$reviewData=@{breeds=@($report.breeds|ForEach-Object{@{id=$_.breed;name=$displayNames[$_.breed];width=$_.width;height=$_.height;sha256=$_.masterSha256}});actions=@($actionCatalog.actions|ForEach-Object{@{id=$_.id;name=$_.name}})}|ConvertTo-Json -Depth 6 -Compress
$html=@'
<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>루비 도트 동작 검수</title>
<style>body{margin:0;background:#17191f;color:#faf6ee;font:16px system-ui,sans-serif}header{position:sticky;top:0;background:#17191fee;padding:20px 24px;z-index:1;border-bottom:1px solid #3b3e48}h1{font-size:22px;margin:0 0 12px}select,button{font:inherit;background:#2b2d35;color:inherit;border:1px solid #626570;border-radius:8px;padding:8px 12px;margin-right:8px}p{font-size:13px;color:#b7bac3}main{padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px}article{border:1px solid #3b3e48;border-radius:14px;overflow:hidden;background:#202229}h2{font-size:15px;margin:16px 18px}img{display:block;width:100%;height:300px;object-fit:contain;image-rendering:pixelated}footer{font-size:11px;overflow-wrap:anywhere;color:#b7bac3;padding:8px 24px 24px}a{color:#c4dbff}</style>
<header><h1>루비 도트 · 열여섯 동작</h1><select id="breed" aria-label="견종"></select><button id="toggle">정지 프레임 보기</button><p>배 뒤집고 눕기에서 네 발바닥을 확인하세요. Aseprite 원본의 공통 기본 눈을 합성한 검수용 미리보기입니다.</p></header><main id="grid"></main><footer id="proof"></footer>
<script>const data=__REVIEW_DATA__;const select=document.querySelector('#breed'),grid=document.querySelector('#grid'),toggle=document.querySelector('#toggle');let animated=true;for(const breed of data.breeds){const option=document.createElement('option');option.value=breed.id;option.textContent=breed.name;select.append(option)}select.value=data.breeds.some(b=>b.id==='pomeranian')?'pomeranian':data.breeds[0].id;function render(){const breed=data.breeds.find(b=>b.id===select.value);grid.replaceChildren();if(animated){for(const action of data.actions){const card=document.createElement('article'),title=document.createElement('h2'),img=document.createElement('img');title.textContent=action.name;img.src=breed.id+'-'+action.id+'.gif';img.alt=breed.name+' '+action.name;card.append(title,img);grid.append(card)}}else{for(let panel=0;panel<4;panel++){const card=document.createElement('article'),title=document.createElement('h2'),img=document.createElement('img');title.textContent=data.actions.slice(panel*4,panel*4+4).map(a=>a.name).join(' · ');img.src=breed.id+'-actions-'+(panel*4+1)+'-'+(panel*4+4)+'.png';img.alt=title.textContent;img.style.height='auto';card.append(title,img);grid.append(card)}}toggle.textContent=animated?'정지 프레임 보기':'애니메이션 보기';document.querySelector('#proof').textContent='원본 프레임 '+breed.width+' × '+breed.height+' px · 검수 대상 원본 SHA-256 '+breed.sha256}select.onchange=render;toggle.onclick=()=>{animated=!animated;render()};render();</script></html>
'@
[IO.File]::WriteAllText((Join-Path $output 'review.html'),$html.Replace('__REVIEW_DATA__',$reviewData),$utf8)
