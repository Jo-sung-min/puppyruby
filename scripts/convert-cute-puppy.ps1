param(
    [Parameter(Mandatory=$true)][ValidatePattern('^(cozy|bean|bright|button)-(chubby|slim|tall|loaf)$')][string]$Id,
    [string]$InputPng,
    [string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$RemoveNeutralBackground,
    [switch]$Publish
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output=Join-Path $workspace 'local-assets/work/cute-puppies-v1'
if(-not $InputPng){$InputPng=Join-Path $output ('originals/'+$Id+'.png')}
$source=[IO.Path]::GetFullPath($InputPng)
$destination=Join-Path $output ('processed/'+$Id)
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'Generated source PNG was not found.'}
if(-not(Test-Path -LiteralPath $Aseprite -PathType Leaf)){throw 'Paid Aseprite executable was not found.'}
$names=@(($Id+'.aseprite'),($Id+'.png'),($Id+'-preview.png'),($Id+'.json'))
foreach($name in $names){if(Test-Path -LiteralPath (Join-Path $destination $name)){throw ('Refusing to overwrite existing output: '+$name)}}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$sourceHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$isolated=Join-Path $destination 'source-input.png'
Copy-Item -LiteralPath $source -Destination $isolated
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Aseprite;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($argument in @('--batch','--script-param',('input='+$isolated),'--script-param',('output='+$destination),'--script-param',('id='+$Id),'--script-param',('removeNeutral='+$RemoveNeutralBackground.IsPresent.ToString().ToLowerInvariant()),'--script',(Join-Path $PSScriptRoot 'aseprite/convert-cute-puppy.lua'))){$start.ArgumentList.Add($argument)}
$process=[Diagnostics.Process]::Start($start)
$stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync();$process.WaitForExit()
$stdout=$stdoutTask.GetAwaiter().GetResult();$stderr=$stderrTask.GetAwaiter().GetResult();$exitCode=$process.ExitCode;$process.Dispose()
[IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),('Exit code: '+$exitCode+[Environment]::NewLine+$stdout+$stderr),[Text.UTF8Encoding]::new($false))
if($exitCode -ne 0 -or $stderr -match 'error|invalid|not supported'){throw 'Aseprite conversion failed; inspect aseprite.log.'}
foreach($name in $names){if(-not(Test-Path -LiteralPath (Join-Path $destination $name) -PathType Leaf)){throw ('Aseprite did not save '+$name)}}
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $sourceHash){throw 'Original image changed unexpectedly.'}

# Read-only validation of PNG pixels, editable header, and exact renderer data.
Add-Type -AssemblyName System.Drawing
$native=[Drawing.Bitmap]::new((Join-Path $destination ($Id+'.png')))
$preview=[Drawing.Bitmap]::new((Join-Path $destination ($Id+'-preview.png')))
$data=Get-Content -LiteralPath (Join-Path $destination ($Id+'.json')) -Raw|ConvertFrom-Json
try{
    if($native.Width -ne 64 -or $native.Height -ne 64 -or $data.width -ne 64 -or $data.height -ne 64 -or $preview.Width -ne 512 -or $preview.Height -ne 512){throw 'Unexpected sprite dimensions.'}
    if($data.palette.Count -gt 12 -or $data.palette.Count -lt 2 -or $data.palette[0] -ne '#00000000' -or $data.rows.Count -ne 64 -or $data.roles.Count -ne $data.palette.Count){throw 'Invalid compact sprite palette or matrix.'}
    $rgba=[Collections.Generic.HashSet[int]]::new();$transparent=0;$opaque=0
    for($y=0;$y -lt 64;$y++){
        if($data.rows[$y].Length -ne 64){throw 'Invalid compact row width.'}
        for($x=0;$x -lt 64;$x++){
            $pixel=$native.GetPixel($x,$y)
            if($pixel.A -eq 0){$transparent++}elseif($pixel.A -eq 255){$opaque++;$null=$rgba.Add($pixel.ToArgb())}else{throw 'Partial transparency found.'}
            $index='0123456789abcdefghijklmnopqrstuvwxyz'.IndexOf($data.rows[$y][$x])
            if($index -lt 0 -or $index -ge $data.palette.Count){throw 'Invalid compact palette index.'}
            $actual=('#{0:x2}{1:x2}{2:x2}{3:x2}' -f $pixel.R,$pixel.G,$pixel.B,$pixel.A)
            if($pixel.A -eq 0){$actual='#00000000'}
            if($data.palette[$index] -ne $actual){throw ('Compact renderer data differs from exported PNG at '+$x+','+$y)}
            for($dy=0;$dy -lt 8;$dy++){for($dx=0;$dx -lt 8;$dx++){if($preview.GetPixel(($x*8+$dx),($y*8+$dy)).ToArgb() -ne $pixel.ToArgb()){throw 'Preview differs from exact nearest-neighbor expansion.'}}}
        }
    }
    if($transparent -eq 0 -or $opaque -eq 0 -or $rgba.Count+1 -gt 12){throw 'Sprite requires transparency and at most 12 colors including transparency.'}
    $bytes=[IO.File]::ReadAllBytes((Join-Path $destination ($Id+'.aseprite')))
    if($bytes.Length -lt 128 -or [BitConverter]::ToUInt16($bytes,4) -ne 0xA5E0 -or [BitConverter]::ToUInt16($bytes,6) -ne 1 -or [BitConverter]::ToUInt16($bytes,8) -ne 64 -or [BitConverter]::ToUInt16($bytes,10) -ne 64 -or [BitConverter]::ToUInt16($bytes,12) -ne 8){throw 'Editable Aseprite header is not a native indexed one-frame sprite.'}
    $summary=[ordered]@{id=$Id;source=$source;sourceSha256=$sourceHash;width=64;height=64;paletteCount=$data.palette.Count;opaqueColors=$rgba.Count;transparentPixels=$transparent;opaquePixels=$opaque;neutralBorderCleanup=$RemoveNeutralBackground.IsPresent;binaryAlpha=$true;exactNearestPreview=$true;exactCompactData=$true;pngSha256=(Get-FileHash -LiteralPath (Join-Path $destination ($Id+'.png'))).Hash;asepriteSha256=(Get-FileHash -LiteralPath (Join-Path $destination ($Id+'.aseprite'))).Hash}
    [IO.File]::WriteAllText((Join-Path $destination 'conversion.json'),($summary|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}finally{$native.Dispose();$preview.Dispose()}
if($Publish){
    $imageDir=Join-Path $workspace 'local-assets/site/images/cute-puppies-v1'
    $downloadDir=Join-Path $workspace 'local-assets/site/downloads/cute-puppies-v1'
    [IO.Directory]::CreateDirectory($imageDir)|Out-Null;[IO.Directory]::CreateDirectory($downloadDir)|Out-Null
    foreach($target in @((Join-Path $imageDir ($Id+'.png')),(Join-Path $downloadDir ($Id+'.aseprite')))){if(Test-Path -LiteralPath $target){throw 'Refusing to overwrite published artwork.'}}
    Copy-Item -LiteralPath (Join-Path $destination ($Id+'.png')) -Destination (Join-Path $imageDir ($Id+'.png'))
    Copy-Item -LiteralPath (Join-Path $destination ($Id+'.aseprite')) -Destination (Join-Path $downloadDir ($Id+'.aseprite'))
    & (Join-Path $PSScriptRoot 'update-cute-puppy-data.ps1')|Out-Null
}
$summary|ConvertTo-Json -Compress
