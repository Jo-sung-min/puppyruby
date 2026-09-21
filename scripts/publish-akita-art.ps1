$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$build=Join-Path $projectRoot 'backend/build/site-download-publisher'
$classpath=[IO.File]::ReadAllText((Join-Path $build 'runtime-classpath.txt')).Trim()
$javaCommand=(Get-Command java -ErrorAction Stop).Source
$javacCommand=Join-Path (Split-Path $javaCommand) 'javac.exe'
& $javacCommand -encoding UTF-8 -cp ($build+';'+$classpath) -d $build (Join-Path $PSScriptRoot 'AkitaArtPublisher.java')
if($LASTEXITCODE -ne 0){throw 'Akita publisher compilation failed.'}
& $javaCommand -cp ($build+';'+$classpath) AkitaArtPublisher $projectRoot
if($LASTEXITCODE -ne 0){throw 'Akita publication was not verified; release pointer was not changed.'}
