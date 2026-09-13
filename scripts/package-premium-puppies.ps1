param([string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output=Join-Path $workspace 'local-assets/work/premium-puppies-v1'
$stage=Join-Path $output 'package'
$archive=Join-Path $output 'puppyruby-premium-puppies-12.zip'
$published=Join-Path $workspace 'local-assets/site/downloads/puppyruby-premium-puppies-12.zip'
foreach($path in @($stage,$archive,$published)){if(Test-Path -LiteralPath $path){throw 'Refusing to overwrite an existing premium package.'}}
& (Join-Path $PSScriptRoot 'update-premium-puppy-data.ps1') -RequireComplete|Out-Null
$manifestPath=Join-Path $workspace 'frontend/src/lib/generated/premium-puppy-assets.json'
$manifest=@(Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json)
$metadata=Get-Content -LiteralPath (Join-Path $output 'style-prompts.json') -Raw|ConvertFrom-Json
if($manifest.Count -ne 12 -or $metadata.variants.Count -ne 12){throw 'Expected twelve verified sprite masters and original prompts.'}
[IO.Directory]::CreateDirectory((Join-Path $stage 'png'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $stage 'aseprite'))|Out-Null
$proofs=@()
foreach($record in $manifest){
    if(@($metadata.variants|Where-Object id -eq $record.id).Count -ne 1){throw 'Prompt provenance mismatch.'}
    $proof=Get-Content -LiteralPath (Join-Path $output ('processed/'+$record.id+'/conversion.json')) -Raw|ConvertFrom-Json
    if(-not $proof.exactVisibleRgba -or $proof.resized -or $proof.quantized -or $proof.recolored -or $proof.pixelComparison.changedArtworkRgbaPixels -ne 0){throw 'Original pixels were not preserved.'}
    foreach($extension in @('png','aseprite')){
        $folder=if($extension -eq 'png'){'images'}else{'downloads'}
        $source=Join-Path $workspace ('local-assets/site/'+$folder+'/premium-puppies-v1/'+$record.id+'.'+$extension)
        Copy-Item -LiteralPath $source -Destination (Join-Path $stage ($extension+'/'+$record.id+'.'+$extension))
    }
    $proofs+=$proof
}
Copy-Item -LiteralPath (Join-Path $output 'style-prompts.json') -Destination (Join-Path $stage 'style-prompts.json')
$lines=@('퍼피루비 고급 도트 느낌 강아지 12종','','png/: 생성 원본의 해상도와 색을 유지한 투명 PNG.','aseprite/: 같은 원본 해상도를 가진 Aseprite RGBA 편집 파일.','style-prompts.json: 내장 이미지 생성에 사용한 원문 프롬프트.','','원고 생성: ChatGPT 내장 image_gen.','편집: 정식 Aseprite 1.3.18.5, 32비트 RGBA, 정적인 1프레임·1레이어.','강아지 원고를 축소하거나 색수를 제한하거나 견종별 색으로 다시 칠하지 않았습니다.','불투명 체크 배경이 포함된 원고만 테두리에 연결된 밝은 중성 회색 영역을 Aseprite에서 제거했습니다.','투명 배경으로 생성된 원고의 RGBA는 그대로 보존했습니다.','남긴 강아지 픽셀의 RGB·알파가 생성 원본과 같은지 별도 검증했습니다.','원본 생성 파일은 프로젝트 local-assets/work/premium-puppies-v1/originals에 보존되어 있습니다.','contact-sheet는 비교용 미리보기이며 다운로드 PNG·Aseprite 원본은 축소되지 않았습니다.','','목록')
foreach($variant in $metadata.variants){$record=$manifest|Where-Object id -eq $variant.id;$lines+=($variant.code+' '+$variant.name+' — '+$variant.id+' ('+$record.width+'×'+$record.height+')')}
[IO.File]::WriteAllLines((Join-Path $stage 'README.txt'),$lines,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'compose-premium-puppies.ps1') -Aseprite $Aseprite|Out-Null
& (Join-Path $PSScriptRoot 'compose-premium-puppies.ps1') -Aseprite $Aseprite -Theme dark -OutputName 'contact-sheet-dark.png'|Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$archive,[IO.Compression.CompressionLevel]::Optimal,$false)
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
    if($zip.Entries.Count -ne 26){throw 'Expected 24 master files, README and generation prompts.'}
    foreach($entry in $zip.Entries){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{$actual=[Convert]::ToHexString($hash.ComputeHash($stream))}finally{$hash.Dispose();$stream.Dispose()};if($actual -ne (Get-FileHash -LiteralPath (Join-Path $stage $entry.FullName)).Hash){throw 'ZIP entry checksum mismatch.'}}
}finally{$zip.Dispose()}
Copy-Item -LiteralPath $archive -Destination $published
$result=[ordered]@{count=12;entries=26;archive=$published;archiveBytes=(Get-Item -LiteralPath $published).Length;archiveSha256=(Get-FileHash -LiteralPath $archive).Hash;contactSheet=(Join-Path $output 'contact-sheet.png');darkContactSheet=(Join-Path $output 'contact-sheet-dark.png');fullResolutionPreserved=$true;retainedRgbaPreserved=$true;sourceMode=$metadata.mode;conversions=$proofs}
[IO.File]::WriteAllText((Join-Path $output 'completion.json'),($result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
[PSCustomObject]@{count=12;entries=26;archive=$published;archiveBytes=$result.archiveBytes;contactSheet=$result.contactSheet;fullResolutionPreserved=$true;retainedRgbaPreserved=$true}|ConvertTo-Json -Compress
