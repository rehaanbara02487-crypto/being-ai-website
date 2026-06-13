# Start BeingAI backend and frontend (Phase 0+)
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "BeingAI dev — starting backend and frontend..." -ForegroundColor Cyan

# Ensure the FastAPI workspace directory exists
New-Item -ItemType Directory -Force -Path "$Root\data\workspaces" | Out-Null

# Initialize DB if missing
if (-not (Test-Path "$Root\data\beingai.db")) {
    python "$Root\scripts\init_db.py"
}

$backend = Start-Process -PassThru -WorkingDirectory "$Root\backend" `
    -FilePath "python" -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"

$frontend = Start-Process -PassThru -WorkingDirectory "$Root\frontend\frontend" `
    -FilePath "npm" -ArgumentList "run", "dev"

Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop (kill PIDs manually if needed)." -ForegroundColor Yellow
