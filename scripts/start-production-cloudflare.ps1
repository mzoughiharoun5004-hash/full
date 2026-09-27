# ==============================================================================
# SupScenario - Start Production Stack with Cloudflare Tunnel (Windows PowerShell)
# ==============================================================================

Write-Host ">>> Checking .env.production..." -ForegroundColor Cyan
if (-not (Test-Path ".env.production")) {
    Copy-Item ".env.production.example" ".env.production"
    Write-Host "[!] Created .env.production from example. Please check your API keys." -ForegroundColor Yellow
}

Write-Host ">>> Building and starting Docker microservices..." -ForegroundColor Cyan
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

Write-Host ">>> Waiting for Cloudflare Tunnel URL..." -ForegroundColor Cyan
# A quick tunnel gets a NEW random hostname every time cloudflared starts, and
# `docker logs` keeps the output of every earlier start too. So take the LAST
# URL (the current one), and poll instead of sleeping a fixed 6 seconds so a
# freshly started tunnel has time to print it.
$url = $null
for ($attempt = 0; $attempt -lt 15 -and -not $url; $attempt++) {
    Start-Sleep -Seconds 2
    # -join also turns "no output yet" into an empty string ([regex] rejects $null).
    $logs = (docker logs supscenario_cloudflared 2>&1) -join "`n"
    $urls = [regex]::Matches($logs, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($urls.Count -gt 0) { $url = $urls[$urls.Count - 1].Value }
}

if ($url) {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " SUP SCENARIO IS PUBLICLY ACCESSIBLE AT:               " -ForegroundColor Green
    Write-Host " $url " -ForegroundColor Yellow
    Write-Host "========================================================`n" -ForegroundColor Green
} else {
    Write-Host "Check container logs with: docker logs supscenario_cloudflared" -ForegroundColor Yellow
}
