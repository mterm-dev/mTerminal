<#
.SYNOPSIS
  mTerminal Windows installer — builds NSIS bundle and runs it silently.

.PARAMETER Mode
  PerUser (default) installs to %LocalAppData%\Programs\mTerminal.
  System installs to Program Files (requires elevation).

.PARAMETER SkipBuild
  Skip the build step and use an existing NSIS installer in
  src-tauri\target\release\bundle\nsis\.

.PARAMETER Uninstall
  Run the registered uninstaller.

.EXAMPLE
  pwsh -File .\install.ps1
  pwsh -File .\install.ps1 -Mode System
  pwsh -File .\install.ps1 -Uninstall
#>

[CmdletBinding()]
param(
    [ValidateSet('PerUser', 'System')]
    [string]$Mode = 'PerUser',
    [switch]$SkipBuild,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$AppName = 'mTerminal'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Uninstaller {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem $root | ForEach-Object {
            $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($p.DisplayName -eq $AppName -and $p.QuietUninstallString) {
                return $p.QuietUninstallString
            }
            if ($p.DisplayName -eq $AppName -and $p.UninstallString) {
                return $p.UninstallString
            }
        }
    }
    return $null
}

if ($Uninstall) {
    $cmd = Find-Uninstaller
    if (-not $cmd) {
        Write-Host "no $AppName installation found in registry"
        exit 0
    }
    Write-Host "→ running uninstaller: $cmd"
    cmd /c $cmd
    exit $LASTEXITCODE
}

# ── prerequisites ────────────────────────────────────────────────
function Need($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Error "missing: $name"
        exit 1
    }
}

if (-not $SkipBuild) {
    Need 'pnpm'
    Need 'cargo'
    Need 'rustc'
}

Set-Location $RepoRoot

# ── build ────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host '→ installing JS deps'
    & pnpm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host '→ building release bundle (this can take a few minutes)'
    & pnpm tauri build --bundles nsis
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$bundleDir = Join-Path $RepoRoot 'src-tauri\target\release\bundle\nsis'
$installer = Get-ChildItem -Path $bundleDir -Filter '*-setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    Write-Error "no NSIS installer found in $bundleDir"
    exit 1
}

# ── install ──────────────────────────────────────────────────────
# NSIS installer is configured for currentUser (per tauri.conf.json).
# /S = silent. -Mode System is best-effort: requires the bundle to be built
# with installMode: perMachine; otherwise the installer ignores it.
Write-Host "→ running installer: $($installer.FullName)"
$nsisArgs = @('/S')
$verb = if ($Mode -eq 'System') { 'RunAs' } else { 'Open' }

$proc = Start-Process -FilePath $installer.FullName -ArgumentList $nsisArgs -Wait -PassThru -Verb $verb
if ($proc.ExitCode -ne 0) {
    Write-Error "installer exited with $($proc.ExitCode)"
    exit $proc.ExitCode
}

Write-Host ''
Write-Host "✓ installed $AppName"
if ($Mode -eq 'PerUser') {
    Write-Host "  location: $env:LOCALAPPDATA\Programs\$AppName"
} else {
    Write-Host "  location: $env:ProgramFiles\$AppName"
}
Write-Host '  launch from start menu or via mTerminal.exe'
