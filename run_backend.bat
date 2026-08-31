@echo off
echo ===================================================
echo Starting AyushIP Statutory RAG Backend Server
echo ===================================================

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Error: Virtual environment .venv not found. Please create it first.
    pause
    exit /b 1
)

echo Activating Python virtual environment...
call .venv\Scripts\activate.bat

echo Starting FastAPI server on http://127.0.0.1:8000 ...
python backend\main.py

pause

