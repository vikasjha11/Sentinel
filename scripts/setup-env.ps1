$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $ProjectRoot ".env"
$ExamplePath = Join-Path $ProjectRoot ".env.example"

if (-not (Test-Path $ExamplePath)) {
    throw ".env.example was not found in the project root."
}

if (Test-Path $EnvPath) {
    $content = Get-Content -Raw -Path $EnvPath
    Write-Host "Existing .env found. Updating only the required secret values; other settings are preserved." -ForegroundColor Yellow
} else {
    $content = Get-Content -Raw -Path $ExamplePath
    Write-Host "Creating .env from .env.example..." -ForegroundColor Cyan
}

function New-Secret {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
}

$secrets = @{
    "JWT_SECRET" = New-Secret
    "TILDA_JWT_SECRET" = New-Secret
    "RECOVERY_TOKEN" = New-Secret
    "ALERT_WEBHOOK_TOKEN" = New-Secret
    "ADMIN_PASSWORD" = New-Secret
    "GRAFANA_ADMIN_PASSWORD" = New-Secret
}

foreach ($key in $secrets.Keys) {
    $line = "(?m)^" + [regex]::Escape($key) + "=.*$"
    $replacement = "$key=" + $secrets[$key]
    if ([regex]::IsMatch($content, $line)) {
        $content = [regex]::Replace($content, $line, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
    } else {
        $content = $content.TrimEnd() + "`r`n" + $replacement + "`r`n"
    }
}

[System.IO.File]::WriteAllText($EnvPath, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ".env is ready. Five unique secrets were generated." -ForegroundColor Green
Write-Host "Admin email: admin@tilda.local"
Write-Host "Admin password: generated in .env (do not share it)."
Write-Host ""
Write-Host "Next run: docker compose config --quiet" -ForegroundColor Cyan
