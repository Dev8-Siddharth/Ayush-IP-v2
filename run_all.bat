@echo off
echo ===================================================
echo Launching AyushIP Full System (Backend & Frontend)
echo ===================================================

cd /d "%~dp0"

echo 1. Launching Python FastAPI RAG Backend in separate window...
start "AyushIP Backend (FastAPI on Port 8000)" cmd /k "call .venv\Scripts\activate.bat && python backend\main.py"

echo Waiting 3 seconds for backend initialization...
timeout /t 3 /nobreak >nul

echo 2. Launching Frontend Web Server in separate window...
start "AyushIP Frontend (Port 3000)" cmd /k "npm.cmd run dev"

echo.
echo Both services have been launched!
echo Open http://localhost:3000 in your browser.
echo.
pause

