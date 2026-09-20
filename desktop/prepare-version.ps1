$ErrorActionPreference = 'Stop'
$desktopVersion = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json
if ($desktopVersion.version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Desktop version must have four numeric parts.' }
$parsedDesktopVersion = [Version]::Parse($desktopVersion.version)
if (@($parsedDesktopVersion.Major, $parsedDesktopVersion.Minor, $parsedDesktopVersion.Build, $parsedDesktopVersion.Revision | Where-Object { $_ -gt 65534 }).Count -ne 0) { throw 'Desktop version components exceed the assembly version limit.' }
if ([string]::IsNullOrWhiteSpace($desktopVersion.notes) -or $desktopVersion.notes.Length -gt 500) { throw 'Desktop release notes must contain 1 to 500 characters.' }
$desktopVersionBuild = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-assets/desktop/build'
New-Item -ItemType Directory -Force -Path $desktopVersionBuild | Out-Null
$desktopVersionSource = Join-Path $desktopVersionBuild 'VersionInfo.cs'
$desktopVersionCode = 'using System.Reflection;' + [Environment]::NewLine +
    '[assembly: AssemblyVersion("' + $desktopVersion.version + '")]' + [Environment]::NewLine +
    '[assembly: AssemblyFileVersion("' + $desktopVersion.version + '")]' + [Environment]::NewLine
[IO.File]::WriteAllText($desktopVersionSource, $desktopVersionCode, [Text.UTF8Encoding]::new($false))
Write-Output $desktopVersionSource
