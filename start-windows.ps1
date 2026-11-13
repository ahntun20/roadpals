# Starts everything for local testing on Windows, each part in its own window:
#   1. Server (Docker: Postgres + Redis + API)   2. Fake drivers   3. The Expo app
#
# Usage (from the roadpals folder):
#   .\start-windows.ps1
#   .\start-windows.ps1 -Lat 40.7128 -Lng -74.0060 -Drivers 30
param(
  [double]$Lat = 40.758,
  [double]$Lng = -73.9855,
  [int]$Drivers = 25
)

$root = $PSScriptRoot

# Your computer's Wi-Fi/Ethernet IP, so the phone can reach the server.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -in @('Dhcp', 'Manual') -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notlike '*vEthernet*' -and $_.InterfaceAlias -notlike '*VirtualBox*' } |
  Sort-Object { if ($_.InterfaceAlias -like 'Wi-Fi*') { 0 } else { 1 } } |
  Select-Object -First 1).IPAddress
if (-not $ip) { $ip = Read-Host 'Could not find your IP. Type it (from ipconfig, IPv4 Address)' }
Write-Host "Your computer's IP: $ip" -ForegroundColor Cyan

# Docker must be running.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker is not running. Open Docker Desktop, wait for "Engine running", then run this again.' -ForegroundColor Red
  exit 1
}

# 1. Server
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; `$host.UI.RawUI.WindowTitle='RoadPals server'; docker compose up --build"

Write-Host 'Waiting for the server to start (first time can take a few minutes)...'
$ok = $false
for ($i = 0; $i -lt 120; $i++) {
  try { Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep -Seconds 3 }
}
if (-not $ok) { Write-Host 'Server did not start. Check the "RoadPals server" window for errors.' -ForegroundColor Red; exit 1 }
Write-Host 'Server is up.' -ForegroundColor Green

# Sample check-in places near your location (safe to run more than once).
docker compose exec -T -e SEED_LAT=$Lat -e SEED_LNG=$Lng server npx tsx src/seed.ts

# 2. Fake drivers
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; `$host.UI.RawUI.WindowTitle='RoadPals simulator'; `$env:API_URL='http://127.0.0.1:4000'; `$env:SIM_LAT='$Lat'; `$env:SIM_LNG='$Lng'; `$env:SIM_DRIVERS='$Drivers'; npm run simulate"

# 3. App (scan the QR code with Expo Go). REACT_NATIVE_PACKAGER_HOSTNAME makes the QR code use
#    your Wi-Fi IP instead of a virtual adapter (VirtualBox/WSL) the phone can't reach.
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\app'; `$host.UI.RawUI.WindowTitle='RoadPals app'; `$env:EXPO_PUBLIC_API_URL='http://${ip}:4000'; `$env:REACT_NATIVE_PACKAGER_HOSTNAME='$ip'; npx expo start"

Write-Host ''
Write-Host 'All started. Scan the QR code in the "RoadPals app" window with Expo Go.' -ForegroundColor Green
Write-Host "Phone check: open http://${ip}:4000/health in your phone's browser."
Write-Host 'To stop: close the three windows, then run: docker compose down'
