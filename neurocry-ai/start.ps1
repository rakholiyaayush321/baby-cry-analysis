$ErrorActionPreference = "Stop"

Write-Host "Setting up Python virtual environment..."
python -m venv venv

Write-Host "Activating virtual environment and installing backend requirements..."
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Write-Host "Starting Backend Server (FastAPI)..."
Start-Process -FilePath ".\venv\Scripts\python.exe" -ArgumentList "-m uvicorn main:app --reload --port 8000" -WorkingDirectory ".\backend" -WindowStyle Normal

Write-Host "Starting Frontend Server (HTTP)..."
Start-Process -FilePath "python" -ArgumentList "-m http.server 8080" -WorkingDirectory ".\frontend" -WindowStyle Normal

Write-Host "Waiting a moment for servers to start..."
Start-Sleep -Seconds 3

Write-Host "Opening Frontend in default browser..."
Start-Process "http://localhost:8080/index.html"

Write-Host "Application started successfully."
