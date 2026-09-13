param(
    [Parameter(Mandatory=$true)][ValidatePattern('^art-(0[1-9]|[12][0-9]|30)$')][string]$Id,
    [Parameter(Mandatory=$true)][string]$InputPng,
    [string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe',
    [switch]$Publish,
    [switch]$VerifyExisting
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source=[IO.Path]::GetFullPath($InputPng)
$destination=Join-Path $workspace ('local-assets/work/original-art-dogs-v1/processed/'+$Id)
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'Generated source PNG was not found.'}
if(-not(Test-Path -LiteralPath $Aseprite -PathType Leaf)){throw 'Paid Aseprite executable was not found.'}
if(-not $VerifyExisting){foreach($extension in @('png','aseprite')){if(Test-Path -LiteralPath (Join-Path $destination ($Id+'.'+$extension))){throw 'Refusing to overwrite an existing premium master.'}}}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$sourceHash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
if(-not $VerifyExisting){
$isolated=Join-Path $destination 'source-input.png'
Copy-Item -LiteralPath $source -Destination $isolated
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Aseprite;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
foreach($argument in @('--batch','--script-param',('input='+$isolated),'--script-param',('output='+$destination),'--script-param',('id='+$Id),'--script',(Join-Path $PSScriptRoot 'aseprite/preserve-original-art.lua'))){$start.ArgumentList.Add($argument)}
$process=[Diagnostics.Process]::Start($start)
$stdoutTask=$process.StandardOutput.ReadToEndAsync();$stderrTask=$process.StandardError.ReadToEndAsync()
$process.WaitForExit();$stdout=$stdoutTask.GetAwaiter().GetResult();$stderr=$stderrTask.GetAwaiter().GetResult();$code=$process.ExitCode;$process.Dispose()
[IO.File]::WriteAllText((Join-Path $destination 'aseprite.log'),('Exit code: '+$code+[Environment]::NewLine+$stdout+$stderr),[Text.UTF8Encoding]::new($false))
if($code -ne 0 -or $stderr -match 'error|invalid|not supported'){throw 'Aseprite preservation failed; inspect aseprite.log.'}
}
foreach($extension in @('png','aseprite')){if(-not(Test-Path -LiteralPath (Join-Path $destination ($Id+'.'+$extension)) -PathType Leaf)){throw 'Aseprite did not save the complete master pair.'}}
if((Get-FileHash -LiteralPath $source).Hash -ne $sourceHash){throw 'Generated source changed unexpectedly.'}

# Read-only pixel analysis; this code does not alter any image.
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Security.Cryptography;
public static class OriginalArtPixelAudit {
  private static byte[] Read(Bitmap image) {
    var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    var pixels=new byte[image.Width*image.Height*4];
    try {for(int y=0;y<image.Height;y++) Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),pixels,y*image.Width*4,image.Width*4);}
    finally {image.UnlockBits(data);}
    return pixels;
  }
  public static object Compare(string originalPath,string masterPath) {
    using(var original=new Bitmap(originalPath)) using(var master=new Bitmap(masterPath)) {
      if(original.Width!=master.Width||original.Height!=master.Height) throw new Exception("Source resolution changed.");
      byte[] a=Read(original),b=Read(master);
      int count=original.Width*original.Height,w=original.Width,h=original.Height;
      var seen=new bool[count];var erase=new bool[count];var queue=new Queue<int>();
      Action<int> add=i=>{if(seen[i])return;seen[i]=true;int p=i*4,min=Math.Min(a[p],Math.Min(a[p+1],a[p+2])),max=Math.Max(a[p],Math.Max(a[p+1],a[p+2]));if(a[p+3]==0||(min>=245&&max-min<=8)){erase[i]=true;queue.Enqueue(i);}};
      for(int x=0;x<w;x++){add(x);add((h-1)*w+x);}for(int y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
      while(queue.Count>0){int i=queue.Dequeue(),x=i%w,y=i/w;if(x>0)add(i-1);if(x<w-1)add(i+1);if(y>0)add(i-w);if(y<h-1)add(i+w);}
      if(a[3]==0&&a[(count-1)*4+3]==0) Array.Clear(erase,0,erase.Length);
      int removed=0,kept=0;var originalKept=new List<byte>();var masterKept=new List<byte>();
      for(int i=0;i<count;i++){int p=i*4;if(erase[i]){if(b[p+3]!=0)throw new Exception("Border background not transparent at "+(i%w)+","+(i/w)+" original "+BitConverter.ToString(a,p,4)+" master "+BitConverter.ToString(b,p,4));if(a[p+3]>0)removed++;}else{
        for(int c=0;c<4;c++){if(a[p+3]==0&&b[p+3]==0){originalKept.Add(0);masterKept.Add(0);continue;}if(a[p+c]!=b[p+c])throw new Exception("An artwork RGBA value changed at "+(i%w)+","+(i/w)+" original "+BitConverter.ToString(a,p,4)+" master "+BitConverter.ToString(b,p,4));originalKept.Add(a[p+c]);masterKept.Add(b[p+c]);}if(a[p+3]>0)kept++;
      }}
      string sourceHash,masterHash;using(var sha=SHA256.Create()){sourceHash=BitConverter.ToString(sha.ComputeHash(originalKept.ToArray())).Replace("-","").ToLowerInvariant();masterHash=BitConverter.ToString(sha.ComputeHash(masterKept.ToArray())).Replace("-","").ToLowerInvariant();}
      return new{retainedPixelSha256=sourceHash,masterRetainedPixelSha256=masterHash,removedBorderBackgroundPixels=removed,retainedVisiblePixels=kept,changedArtworkRgbaPixels=0};
    }
  }
  public static object Inspect(string path) {
    using (var image = new Bitmap(path)) {
      var pixels=Read(image);
      int transparent=0,partial=0,opaque=0,left=image.Width,top=image.Height,right=-1,bottom=-1,edge=0;
      var colors = new HashSet<int>();
      for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
        int i=(y*image.Width+x)*4; byte a=pixels[i+3];
        if(a==0) {transparent++;pixels[i]=pixels[i+1]=pixels[i+2]=0;continue;}
        if(a==255) opaque++;else partial++;
        colors.Add(BitConverter.ToInt32(pixels,i));
        left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);
        if(x==0||y==0||x==image.Width-1||y==image.Height-1) edge++;
      }
      string digest;
      using(var sha=SHA256.Create()) digest=BitConverter.ToString(sha.ComputeHash(pixels)).Replace("-","").ToLowerInvariant();
      return new {width=image.Width,height=image.Height,visiblePixelSha256=digest,transparentPixels=transparent,partialAlphaPixels=partial,opaquePixels=opaque,visibleColors=colors.Count,edgeVisiblePixels=edge,bounds=new{left,top,width=right-left+1,height=bottom-top+1}};
    }
  }
}
'@ -ReferencedAssemblies @('System.Drawing.Common','System.Drawing.Primitives','System.Private.Windows.GdiPlus','System.Private.Windows.Core','System.Runtime.InteropServices','System.Collections','System.Security.Cryptography','System.Security.Cryptography.Algorithms')
$original= [OriginalArtPixelAudit]::Inspect($source)
$master= [OriginalArtPixelAudit]::Inspect((Join-Path $destination ($Id+'.png')))
$comparison=[OriginalArtPixelAudit]::Compare($source,(Join-Path $destination ($Id+'.png')))
if($master.width -ne $original.width -or $master.height -ne $original.height -or $comparison.changedArtworkRgbaPixels -ne 0){throw 'Aseprite changed the original dimensions or retained artwork RGBA pixels.'}
if($master.transparentPixels -eq 0 -or ($master.edgeVisiblePixels -gt 0 -and $original.transparentPixels -eq 0)){throw 'Source background requires visual review; no automatic background removal was performed.'}
$aseBytes=[IO.File]::ReadAllBytes((Join-Path $destination ($Id+'.aseprite')))
if($aseBytes.Length -lt 128 -or [BitConverter]::ToUInt16($aseBytes,4) -ne 0xA5E0 -or [BitConverter]::ToUInt16($aseBytes,6) -ne 1 -or [BitConverter]::ToUInt16($aseBytes,8) -ne $original.width -or [BitConverter]::ToUInt16($aseBytes,10) -ne $original.height -or [BitConverter]::ToUInt16($aseBytes,12) -ne 32){throw 'Editable Aseprite header does not preserve the full RGBA canvas.'}
$summary=[ordered]@{id=$Id;source=$source;sourceSha256=$sourceHash;sourcePreserved=$true;exactVisibleRgba=$true;resized=$false;quantized=$false;recolored=$false;frames=1;layers=1;colorDepth=32;width=$master.width;height=$master.height;visiblePixelSha256=$master.visiblePixelSha256;visibleColors=$master.visibleColors;transparentPixels=$master.transparentPixels;partialAlphaPixels=$master.partialAlphaPixels;opaquePixels=$master.opaquePixels;bounds=$master.bounds;backgroundCleanup='Only light neutral pixels connected to image border; min RGB 245, max channel spread 8';pixelComparison=$comparison;pngSha256=(Get-FileHash -LiteralPath (Join-Path $destination ($Id+'.png'))).Hash;asepriteSha256=(Get-FileHash -LiteralPath (Join-Path $destination ($Id+'.aseprite'))).Hash}
[IO.File]::WriteAllText((Join-Path $destination 'conversion.json'),($summary|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
if($Publish){
    foreach($extension in @('png','aseprite')){
        $folder=if($extension -eq 'png'){'images'}else{'downloads'}
        $publicDirectory=Join-Path $workspace ('local-assets/site/'+$folder+'/pixel-art-dogs-v1')
        [IO.Directory]::CreateDirectory($publicDirectory)|Out-Null
        $target=Join-Path $publicDirectory ($Id+'.'+$extension)
        if(Test-Path -LiteralPath $target){throw 'Refusing to overwrite a published premium master.'}
        Copy-Item -LiteralPath (Join-Path $destination ($Id+'.'+$extension)) -Destination $target
    }
}
$summary|ConvertTo-Json -Compress -Depth 5
