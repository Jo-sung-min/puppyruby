param([switch]$RequireComplete)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ids=@('marshmallow','milkbean','honeybun','cloudpuff','biscuit','naploaf','teddycub','peachcheek','buttonpaw','rounddrop','cottonball','caramel')|ForEach-Object{'premium-'+$_}
$records=@()
foreach($id in $ids){
    $png=Join-Path $workspace ('local-assets/site/images/premium-puppies-v1/'+$id+'.png')
    $ase=Join-Path $workspace ('local-assets/site/downloads/premium-puppies-v1/'+$id+'.aseprite')
    $proof=Join-Path $workspace ('local-assets/work/premium-puppies-v1/processed/'+$id+'/conversion.json')
    if((Test-Path -LiteralPath $png) -and (Test-Path -LiteralPath $ase) -and (Test-Path -LiteralPath $proof)){
        $conversion=Get-Content -LiteralPath $proof -Raw|ConvertFrom-Json
        if(-not $conversion.exactVisibleRgba -or $conversion.resized -or $conversion.quantized -or $conversion.recolored -or $conversion.colorDepth -ne 32){throw 'Unverified or reduced master cannot be registered.'}
        if((Get-FileHash -LiteralPath $png).Hash -ne $conversion.pngSha256 -or (Get-FileHash -LiteralPath $ase).Hash -ne $conversion.asepriteSha256){throw 'Public premium assets differ from their verified export.'}
        $records+=@{id=$id;width=$conversion.width;height=$conversion.height}
    }elseif($RequireComplete){throw ('Missing verified master '+$id)}
}
$manifest=Join-Path $workspace 'frontend/src/lib/generated/premium-puppy-assets.json'
$temporary=$manifest+'.tmp'
[IO.File]::WriteAllText($temporary,(ConvertTo-Json -InputObject @($records) -Depth 4),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $manifest -Force
[PSCustomObject]@{count=$records.Count;manifest=$manifest}|ConvertTo-Json -Compress
