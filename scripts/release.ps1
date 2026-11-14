# Publishes a new Buraktrium version that installed copies update to.
#
#   npm run release -- 1.42.0
#
# Bumps the version, commits, tags v<version> and pushes. GitHub Actions then
# builds the signed installer and publishes the release; the app picks it up
# on its next update check.
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.42.0, got '$Version'." }

$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  if (git status --porcelain) { throw 'There are uncommitted changes. Commit or stash them first.' }
  if (git tag --list "v$Version") { throw "Tag v$Version already exists." }
  $branch = git rev-parse --abbrev-ref HEAD

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $replace = {
    param($path, $pattern, $replacement)
    $full = Join-Path $repo $path
    $text = [IO.File]::ReadAllText($full)
    $regex = [regex]$pattern
    if (-not $regex.IsMatch($text)) { throw "Version not found in $path" }
    [IO.File]::WriteAllText($full, $regex.Replace($text, $replacement, 1), $utf8)
  }
  & $replace 'package.json' '"version":\s*"[^"]+"' "`"version`": `"$Version`""
  & $replace 'src-tauri/tauri.conf.json' '"version":\s*"[^"]+"' "`"version`": `"$Version`""
  & $replace 'src-tauri/Cargo.toml' '(?m)^version\s*=\s*"[^"]+"' "version = `"$Version`""

  Write-Host 'Updating Cargo.lock...'
  Push-Location src-tauri
  try { cargo check --quiet; if ($LASTEXITCODE -ne 0) { throw 'cargo check failed' } } finally { Pop-Location }

  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -m "Release v$Version"
  git tag "v$Version"
  git push origin $branch
  git push origin "v$Version"
  if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }

  Write-Host "Released v$Version. Build progress: https://github.com/nijelouss/buraktrium/actions" -ForegroundColor Green
} finally {
  Pop-Location
}
