$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = Join-Path $root "venv\Scripts\python.exe"
}
if (-not (Test-Path $python)) {
    $python = "python"
}

$backendCommand = "Set-Location '$root'; & '$python' -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000"
$frontendCommand = "Set-Location '$root\frontend'; npm run dev"

$backend = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
) -PassThru

$frontend = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCommand
) -PassThru

Write-Host "Backend:  http://localhost:8000"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Dong cua cua so nay de dung ca hai server."

try {
    Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
    foreach ($process in @($backend, $frontend)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
