param(
    [Parameter(Mandatory=$true)][ValidatePattern('^C(0[1-9]|1[0-2])$')][string]$Id,
    [Parameter(Mandatory=$true)][string]$InputPng,
    [ValidateSet(48,64)][int]$NativeSize=64,
    [ValidateRange(8,32)][int]$Colors=12,
    [string]$OutputDirectory,
    [string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$Publish
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source=[IO.Path]::GetFullPath($InputPng)
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'Generated source PNG was not found.'}
if(-not $OutputDirectory){$OutputDirectory=Join-Path $workspace ('local-assets/work/imaginary-pixel-12/processed/'+$Id)}
$destination=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $destination.StartsWith($workspace+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Output must remain inside the project workspace.'}
if(-not(Test-Path -LiteralPath $Aseprite -PathType Leaf)){throw 'Aseprite executable was not found.'}
$outputNames=@(($Id+'.aseprite'),($Id+'.png'),($Id+'-preview.png'))
foreach($name in $outputNames){if(Test-Path -LiteralPath (Join-Path $destination $name)){throw ('Refusing to overwrite existing output: '+$name)}}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$sourceHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$isolatedInput=Join-Path $destination 'source-input.png'
# Aseprite auto-detects numbered image sequences; isolate each original by name.
Copy-Item -LiteralPath $source -Destination $isolatedInput
$script=Join-Path $PSScriptRoot 'aseprite/convert-imaginary-puppy.lua'
$previewSize=if($NativeSize -eq 48){384}else{512}
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Aseprite
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
foreach($argument in @('--batch','--script-param',('input='+$isolatedInput),'--script-param',('output='+$destination),'--script-param',('id='+$Id),'--script-param',('size='+$NativeSize),'--script-param',('colors='+$Colors),'--script-param',('preview='+$previewSize),'--script',$script)){$start.ArgumentList.Add($argument)}
$process=[Diagnostics.Process]::Start($start)
$stdoutTask=$process.StandardOutput.ReadToEndAsync()
$stderrTask=$process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$stdout=$stdoutTask.GetAwaiter().GetResult()
$stderr=$stderrTask.GetAwaiter().GetResult()
$exitCode=$process.ExitCode
$process.Dispose()
[IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),('Exit code: '+$exitCode+[Environment]::NewLine+$stdout+$stderr),[Text.UTF8Encoding]::new($false))
if($exitCode -ne 0 -or $stderr -match 'error|invalid|not supported'){throw 'Aseprite conversion failed; inspect the output aseprite.log.'}
foreach($name in $outputNames){if(-not(Test-Path -LiteralPath (Join-Path $destination $name) -PathType Leaf)){throw ('Aseprite did not save '+$name)}}
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $sourceHash){throw 'The generated source changed unexpectedly.'}

# Pixel analysis only: all image transformations above run in the paid Aseprite executable.
Add-Type -AssemblyName System.Drawing
$native=[Drawing.Bitmap]::new((Join-Path $destination ($Id+'.png')))
$preview=[Drawing.Bitmap]::new((Join-Path $destination ($Id+'-preview.png')))
try{
    if($native.Width -ne $NativeSize -or $native.Height -ne $NativeSize){throw 'Native dimensions are incorrect.'}
    if($preview.Width -ne $previewSize -or $preview.Height -ne $previewSize){throw 'Preview dimensions are incorrect.'}
    $rgba=[Collections.Generic.HashSet[int]]::new()
    $transparent=0;$opaque=0
    for($y=0;$y -lt $NativeSize;$y++){
        for($x=0;$x -lt $NativeSize;$x++){
            $pixel=$native.GetPixel($x,$y)
            if($pixel.A -eq 0){$transparent++}elseif($pixel.A -eq 255){$opaque++;$null=$rgba.Add($pixel.ToArgb())}else{throw 'Native image contains partially transparent pixels.'}
            for($dy=0;$dy -lt 8;$dy++){
                for($dx=0;$dx -lt 8;$dx++){
                    if($preview.GetPixel(($x*8+$dx),($y*8+$dy)).ToArgb() -ne $pixel.ToArgb()){throw 'Preview is not an exact nearest-neighbor enlargement.'}
                }
            }
        }
    }
    if($transparent -eq 0 -or $opaque -eq 0){throw 'Expected visible artwork and transparent background.'}
    if($rgba.Count -gt $Colors){throw 'Palette reduction did not respect the requested color limit.'}
    $aseBytes=[IO.File]::ReadAllBytes((Join-Path $destination ($Id+'.aseprite')))
    if($aseBytes.Length -lt 128 -or [BitConverter]::ToUInt16($aseBytes,4) -ne 0xA5E0 -or [BitConverter]::ToUInt16($aseBytes,8) -ne $NativeSize -or [BitConverter]::ToUInt16($aseBytes,10) -ne $NativeSize -or [BitConverter]::ToUInt16($aseBytes,12) -ne 8){throw 'Editable Aseprite file header is not a native indexed sprite.'}
    $summary=[PSCustomObject]@{id=$Id;source=$source;sourceSha256=$sourceHash;width=$NativeSize;height=$NativeSize;opaqueColors=$rgba.Count;paletteLimit=$Colors;transparentPixels=$transparent;opaquePixels=$opaque;binaryAlpha=$true;exactNearestPreview=$true;aseprite=(Join-Path $destination ($Id+'.aseprite'));png=(Join-Path $destination ($Id+'.png'));preview=(Join-Path $destination ($Id+'-preview.png'))}
    [IO.File]::WriteAllText((Join-Path $destination 'conversion.json'),($summary|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}finally{$native.Dispose();$preview.Dispose()}

if($Publish){
    if($NativeSize -ne 64){throw 'Administrator gallery contract requires 64px native files.'}
    $imageDirectory=Join-Path $workspace 'local-assets/site/images/imaginary-pixel-v1'
    $downloadDirectory=Join-Path $workspace 'local-assets/site/downloads/imaginary-pixel-v1'
    [IO.Directory]::CreateDirectory($imageDirectory)|Out-Null
    [IO.Directory]::CreateDirectory($downloadDirectory)|Out-Null
    $editableTarget=Join-Path $downloadDirectory ($Id+'.aseprite')
    foreach($name in @(($Id+'.png'))){if(Test-Path -LiteralPath (Join-Path $imageDirectory $name)){throw ('Refusing to overwrite published image '+$name)}}
    if(Test-Path -LiteralPath $editableTarget){throw 'Refusing to overwrite published editable sprite.'}
    foreach($name in @(($Id+'.png'))){
        $target=Join-Path $imageDirectory $name
        Copy-Item -LiteralPath (Join-Path $destination $name) -Destination $target
    }
    Copy-Item -LiteralPath (Join-Path $destination ($Id+'.aseprite')) -Destination $editableTarget
}
$summary|ConvertTo-Json -Compress
