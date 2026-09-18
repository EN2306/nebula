$ErrorActionPreference = 'Stop'
$railSyncUrl = 'http://127.0.0.1:3001'
$railSyncReady = $false
try {
    $railSyncHealth = Invoke-RestMethod -Uri "$railSyncUrl/api/health" -TimeoutSec 2
    $railSyncReady = $railSyncHealth.ok -eq $true
} catch { }
if (-not $railSyncReady) {
    $railSyncNode = (Get-Command node -ErrorAction Stop).Source
    $railSyncLogs = Join-Path $PSScriptRoot 'data'
    New-Item -ItemType Directory -Path $railSyncLogs -Force | Out-Null
    Start-Process -FilePath $railSyncNode -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $railSyncLogs 'server.log') -RedirectStandardError (Join-Path $railSyncLogs 'server-error.log') | Out-Null
    for ($railSyncAttempt = 0; $railSyncAttempt -lt 20; $railSyncAttempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $railSyncHealth = Invoke-RestMethod -Uri "$railSyncUrl/api/health" -TimeoutSec 2
            if ($railSyncHealth.ok) { $railSyncReady = $true; break }
        } catch { }
    }
}
if (-not $railSyncReady) { throw 'RailSync could not start. Check data/server-error.log and whether port 3001 is occupied.' }
Write-Host "RailSync is running at $railSyncUrl"
Start-Process $railSyncUrl
