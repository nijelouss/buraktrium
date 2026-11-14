# Builds Buraktrium from this checkout and swaps it into the installed copy,
# so a change can be tried without running a new installer.
#
#   npm run update-local
#
# The installed app is a single exe, so replacing it is enough. Settings,
# layouts and saved sessions live in the app data folder and are kept.
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$target = Join-Path $env:LOCALAPPDATA 'Buraktrium\buraktrium.exe'
$built = Join-Path $repo 'src-tauri\target\release\buraktrium.exe'

if (-not (Test-Path $target)) {
  throw "Buraktrium is not installed at $target. Install it once with the setup file first."
}

Write-Host 'Building (this takes a few minutes)...'
Push-Location $repo
try {
  npm run tauri build -- --no-bundle
  if ($LASTEXITCODE -ne 0) { throw 'Build failed; the installed app was not touched.' }
} finally {
  Pop-Location
}

# Replacing the exe needs the app closed. Closing it ends its terminals, so
# leave that to the user instead of killing it.
$running = Get-Process buraktrium -ErrorAction SilentlyContinue
if ($running) {
  Write-Host 'Buraktrium is open. Close it to finish the update (its terminals will end)...' -ForegroundColor Yellow
  while (Get-Process buraktrium -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }
}

Copy-Item $built $target -Force
Write-Host 'Updated. Starting Buraktrium...' -ForegroundColor Green
Start-Process $target
