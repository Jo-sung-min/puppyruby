param([switch]$RequireComplete)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output=Join-Path $workspace 'local-assets/work/cute-puppies-v1'
$anchorPath=Join-Path $output 'anchors.json'
$anchors=if(Test-Path -LiteralPath $anchorPath){Get-Content -LiteralPath $anchorPath -Raw|ConvertFrom-Json -AsHashtable}else{@{}}
$sprites=[ordered]@{}
foreach($family in @('cozy','bean','bright','button')){foreach($body in @('chubby','slim','tall','loaf')){
    $id=$family+'-'+$body;$path=Join-Path $output ('processed/'+$id+'/'+$id+'.json')
    if(Test-Path -LiteralPath (Join-Path $workspace ('local-assets/site/images/cute-puppies-v1/'+$id+'.png'))){
        $sprite=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json -AsHashtable
        # Main cream-colored body pixels must follow the selected breed's coat.
        # This changes semantic metadata only; palette values and rows stay exact.
        $counts=@{};$opaqueCount=0
        foreach($row in $sprite.rows){foreach($symbol in $row.ToCharArray()){
            $n='0123456789abcdefghijklmnopqrstuvwxyz'.IndexOf($symbol)
            if($n -gt 0){$counts[$n]=1+$counts[$n];$opaqueCount++}
        }}
        $dominant=$counts.GetEnumerator()|Sort-Object Value -Descending|Select-Object -First 1
        if($sprite.roles[$dominant.Key] -eq 'cream' -and $dominant.Value -gt $opaqueCount*.4){
            for($n=1;$n -lt $sprite.roles.Count;$n++){if($sprite.roles[$n] -eq 'coat'){$sprite.roles[$n]='shade'}}
            $sprite.roles[$dominant.Key]='coat'
        }
        if($sprite.roles -notcontains 'coat'){throw ('Sprite needs a recolorable main coat: '+$id)}
        if($anchors.ContainsKey($id)){
            foreach($name in @('faceX','eyeY','eyeGap','headTop','headBottom','footY')){if(-not $anchors[$id].ContainsKey($name) -or $anchors[$id][$name] -lt 0 -or $anchors[$id][$name] -gt 64){throw ('Invalid hand-reviewed sprite anchor '+$id)}}
            $sprite.anchors=$anchors[$id]
        }elseif($RequireComplete){throw ('Missing reviewed face anchors '+$id)}
        [IO.File]::WriteAllText($path,($sprite|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
        $sprites[$id]=$sprite
    }elseif($RequireComplete){throw ('Missing published sprite '+$id)}
}}
if($RequireComplete -and $sprites.Count -ne 16){throw 'Expected exactly 16 complete sprites.'}
$compact=[ordered]@{schemaVersion=1;sprites=$sprites}|ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $workspace 'frontend/src/lib/generated/cute-puppy-sprites.json'),$compact,[Text.UTF8Encoding]::new($false))
[PSCustomObject]@{sprites=$sprites.Count;reviewedAnchors=$anchors.Count}|ConvertTo-Json -Compress
