param([string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output=Join-Path $workspace 'local-assets/work/cute-puppies-v1'
$stage=Join-Path $output 'package'
$archive=Join-Path $output 'puppyruby-cute-puppies-16.zip'
$published=Join-Path $workspace 'local-assets/site/downloads/puppyruby-cute-puppies-16.zip'
foreach($path in @($stage,$archive,$published)){if(Test-Path -LiteralPath $path){throw 'Refusing to overwrite an existing sprite package.'}}
& (Join-Path $PSScriptRoot 'update-cute-puppy-data.ps1') -RequireComplete|Out-Null
$compactPath=Join-Path $workspace 'frontend/src/lib/generated/cute-puppy-sprites.json'
$compact=Get-Content -LiteralPath $compactPath -Raw|ConvertFrom-Json -AsHashtable
$metadata=Get-Content -LiteralPath (Join-Path $output 'style-prompts.json') -Raw|ConvertFrom-Json
if($metadata.variants.Count -ne 16){throw 'Expected sixteen generation prompts.'}
$summaries=@();$ids=@()
Add-Type -AssemblyName System.Drawing
foreach($family in @('cozy','bean','bright','button')){foreach($body in @('chubby','slim','tall','loaf')){
    $id=$family+'-'+$body;$ids+=$id
    if(@($metadata.variants|Where-Object id -eq $id).Count -ne 1){throw ('Missing or duplicate generation provenance '+$id)}
    $record=Get-Content -LiteralPath (Join-Path $output ('processed/'+$id+'/conversion.json')) -Raw|ConvertFrom-Json
    if($record.width -ne 64 -or $record.height -ne 64 -or -not $record.binaryAlpha -or -not $record.exactNearestPreview -or -not $record.exactCompactData){throw ('Incomplete conversion '+$id)}
    foreach($ext in @('png','aseprite')){
        $folder=if($ext -eq 'png'){'images'}else{'downloads'}
        $source=Join-Path $workspace ('local-assets/site/'+$folder+'/cute-puppies-v1/'+$id+'.'+$ext)
        $converted=Join-Path $output ('processed/'+$id+'/'+$id+'.'+$ext)
        if((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $converted).Hash){throw ('Published sprite differs from conversion '+$id)}
    }
    $data=$compact.sprites[$id]
    if($data.width -ne 64 -or $data.height -ne 64 -or $data.rows.Count -ne 64 -or $data.palette.Count -gt 12 -or $data.palette[0] -ne '#00000000' -or $data.roles -notcontains 'coat'){throw ('Invalid final sprite data '+$id)}
    $png=[Drawing.Bitmap]::new((Join-Path $workspace ('local-assets/site/images/cute-puppies-v1/'+$id+'.png')))
    try{
        for($y=0;$y -lt 64;$y++){
            if($data.rows[$y].Length -ne 64){throw 'Invalid final row width.'}
            for($x=0;$x -lt 64;$x++){
                $n='0123456789abcdefghijklmnopqrstuvwxyz'.IndexOf($data.rows[$y][$x]);$pixel=$png.GetPixel($x,$y)
                $color=if($pixel.A -eq 0){'#00000000'}else{'#{0:x2}{1:x2}{2:x2}{3:x2}' -f $pixel.R,$pixel.G,$pixel.B,$pixel.A}
                if($n -lt 0 -or $n -ge $data.palette.Count -or $color -ne $data.palette[$n]){throw ('Final palette matrix differs from native PNG '+$id)}
            }
        }
    }finally{$png.Dispose()}
    $summaries+=$record
}}
[IO.Directory]::CreateDirectory((Join-Path $stage 'png'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $stage 'aseprite'))|Out-Null
foreach($id in $ids){
    Copy-Item -LiteralPath (Join-Path $workspace ('local-assets/site/images/cute-puppies-v1/'+$id+'.png')) -Destination (Join-Path $stage ('png/'+$id+'.png'))
    Copy-Item -LiteralPath (Join-Path $workspace ('local-assets/site/downloads/cute-puppies-v1/'+$id+'.aseprite')) -Destination (Join-Path $stage ('aseprite/'+$id+'.aseprite'))
}
Copy-Item -LiteralPath (Join-Path $output 'style-prompts.json') -Destination (Join-Path $stage 'style-prompts.json')
Copy-Item -LiteralPath $compactPath -Destination (Join-Path $stage 'sprite-data.json')
$lines=@('퍼피루비 귀여운 강아지 도트 16종','','C12·C01·C06·C04를 참고해 새로 그린 네 계열 × 통통·날씬·롱다리·납작한 체형입니다.','png/: 투명 배경 64×64 PNG 16개.','aseprite/: Aseprite에서 수정할 수 있는 64×64 편집본 16개.','style-prompts.json: 이미지 생성 원문, 참고 계열, 이름.','sprite-data.json: 실제 Aseprite 이미지에서 추출한 팔레트와 픽셀 배열, 견종별 색상 대응 정보.','','ChatGPT 내장 이미지 생성으로 원고를 만들고 Aseprite 1.3.18.5 정식 버전에서 정리했습니다.','각 파일은 정적인 1프레임, 1레이어 시안이며 투명색을 포함해 최대 12색입니다.','불투명한 체크 배경이 있던 원고는 외곽과 연결된 중성 회색 배경만 Aseprite에서 제거한 뒤 축소했습니다.','64×64 정수 픽셀을 nearest-neighbor로 확대해 사용하세요.','생성 원본과 512px 미리보기는 프로젝트 local-assets/work/cute-puppies-v1에 보존되어 있습니다.','','도트 목록')
foreach($variant in $metadata.variants){$lines+=($variant.id+' — '+$variant.name+' ('+$variant.reference+' 참고)')}
[IO.File]::WriteAllLines((Join-Path $stage 'README.txt'),$lines,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'compose-cute-puppies.ps1') -Aseprite $Aseprite|Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$archive,[IO.Compression.CompressionLevel]::Optimal,$false)
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
    if($zip.Entries.Count -ne 35){throw 'Expected 32 sprites, README, prompts and renderer data.'}
    foreach($entry in $zip.Entries){
        $stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create()
        try{$actual=[Convert]::ToHexString($hash.ComputeHash($stream))}finally{$hash.Dispose();$stream.Dispose()}
        if($actual -ne (Get-FileHash -LiteralPath (Join-Path $stage $entry.FullName)).Hash){throw 'ZIP entry checksum mismatch.'}
    }
}finally{$zip.Dispose()}
Copy-Item -LiteralPath $archive -Destination $published
$result=[ordered]@{count=16;entries=35;archive=$published;archiveSha256=(Get-FileHash -LiteralPath $archive).Hash;contactSheet=(Join-Path $output 'contact-sheet.png');exactCompactPixels=$true;sourceMode=$metadata.mode;conversions=$summaries}
[IO.File]::WriteAllText((Join-Path $output 'completion.json'),($result|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[PSCustomObject]@{count=16;entries=35;archive=$published;archiveSha256=$result.archiveSha256;contactSheet=$result.contactSheet}|ConvertTo-Json -Compress
