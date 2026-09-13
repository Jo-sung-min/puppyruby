param([string]$Aseprite='C:\Program Files\Aseprite\Aseprite.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output=Join-Path $workspace 'local-assets/work/imaginary-pixel-12'
$stage=Join-Path $output 'package'
$archive=Join-Path $output 'puppyruby-imaginary-pixel-12.zip'
$publishedArchive=Join-Path $workspace 'local-assets/site/downloads/puppyruby-imaginary-pixel-12.zip'
if((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $archive) -or (Test-Path -LiteralPath $publishedArchive)){throw 'Refusing to overwrite an existing sprite package.'}
$metadata=Get-Content -LiteralPath (Join-Path $output 'style-prompts.json') -Raw|ConvertFrom-Json
if($metadata.candidates.Count -ne 12){throw 'Expected twelve candidate descriptions.'}
$summaries=@()
foreach($index in 1..12){
    $id='C'+$index.ToString('00')
    $candidate=@($metadata.candidates|Where-Object id -eq $id)
    if($candidate.Count -ne 1){throw ('Missing or duplicate candidate '+$id)}
    $record=Get-Content -LiteralPath (Join-Path $output ('processed/'+$id+'/conversion.json')) -Raw|ConvertFrom-Json
    if($record.width -ne 64 -or $record.height -ne 64 -or -not $record.binaryAlpha -or -not $record.exactNearestPreview){throw ('Candidate validation incomplete: '+$id)}
    foreach($item in @(@('png','local-assets/site/images/imaginary-pixel-v1/'),@('aseprite','local-assets/site/downloads/imaginary-pixel-v1/'))){
        $file=Join-Path $workspace ($item[1]+$id+'.'+$item[0])
        $converted=Join-Path $output ('processed/'+$id+'/'+$id+'.'+$item[0])
        if((Get-FileHash -LiteralPath $file).Hash -ne (Get-FileHash -LiteralPath $converted).Hash){throw ('Published asset differs from validated conversion: '+$id)}
    }
    $summaries+=$record
}
[IO.Directory]::CreateDirectory((Join-Path $stage 'png'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $stage 'aseprite'))|Out-Null
foreach($index in 1..12){
    $id='C'+$index.ToString('00')
    Copy-Item -LiteralPath (Join-Path $workspace ('local-assets/site/images/imaginary-pixel-v1/'+$id+'.png')) -Destination (Join-Path $stage ('png/'+$id+'.png'))
    Copy-Item -LiteralPath (Join-Path $workspace ('local-assets/site/downloads/imaginary-pixel-v1/'+$id+'.aseprite')) -Destination (Join-Path $stage ('aseprite/'+$id+'.aseprite'))
}
Copy-Item -LiteralPath (Join-Path $output 'style-prompts.json') -Destination (Join-Path $stage 'style-prompts.json')
$lines=@('퍼피루비 상상 속 픽셀 강아지 12종','','png/: 투명 배경 64×64 PNG 12개.','aseprite/: Aseprite에서 열어 수정할 수 있는 64×64 편집본 12개.','style-prompts.json: 각 시안의 이름, 방향, 이미지 생성 프롬프트.','','ChatGPT 이미지 생성 원고를 Aseprite 1.3.18.5 정식 버전으로 정리했습니다.','각 파일은 정적인 1프레임, 1레이어 시안이며 팔레트는 투명색을 포함해 최대 12색입니다.','이미지 비율을 유지해 64×64 캔버스에 배치하고, 반투명 픽셀을 정리했습니다.','확대해서 사용할 때는 nearest-neighbor 또는 image-rendering: pixelated를 사용하세요.','고해상도 생성 원본과 512px 미리보기는 프로젝트의 local-assets/work/imaginary-pixel-12에 따로 보존됩니다.','','시안 목록')
foreach($candidate in $metadata.candidates){$lines+=($candidate.id+' '+$candidate.name+' — '+$candidate.direction)}
[IO.File]::WriteAllLines((Join-Path $stage 'README.txt'),$lines,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $output 'aseprite-conversions.json'),($summaries|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$sheet=Join-Path $output 'contact-sheet.png'
$si=[Diagnostics.ProcessStartInfo]::new()
$si.FileName=$Aseprite;$si.UseShellExecute=$false;$si.CreateNoWindow=$true;$si.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
foreach($argument in @('--batch','--script-param',('input='+[IO.Path]::GetFullPath((Join-Path $workspace 'local-assets/site/downloads/imaginary-pixel-v1'))),'--script-param',('output='+$sheet),'--script',(Join-Path $PSScriptRoot 'aseprite/compose-imaginary-puppies.lua'))){$si.ArgumentList.Add($argument)}
$p=[Diagnostics.Process]::Start($si);$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync();$p.WaitForExit()
[IO.File]::WriteAllText((Join-Path $output 'contact-sheet.log'),('Exit code: '+$p.ExitCode+[Environment]::NewLine+$stdout.Result+$stderr.Result),[Text.UTF8Encoding]::new($false))
if($p.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $sheet)){throw 'Aseprite contact sheet failed.'};$p.Dispose()
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$archive,[IO.Compression.CompressionLevel]::Optimal,$false)
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
    if($zip.Entries.Count -ne 26){throw 'Archive must contain exactly 24 sprites, README and prompt set.'}
    foreach($entry in $zip.Entries){
        $sourcePath=Join-Path $stage $entry.FullName
        $stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create()
        try{$actual=[Convert]::ToHexString($hash.ComputeHash($stream))}finally{$hash.Dispose();$stream.Dispose()}
        if($actual -ne (Get-FileHash -LiteralPath $sourcePath).Hash){throw 'Archive checksum verification failed.'}
    }
}finally{$zip.Dispose()}
Copy-Item -LiteralPath $archive -Destination $publishedArchive
[PSCustomObject]@{candidates=12;files=26;archive=$publishedArchive;backup=$archive;sha256=(Get-FileHash -LiteralPath $archive).Hash;contactSheet=$sheet}|ConvertTo-Json -Compress
