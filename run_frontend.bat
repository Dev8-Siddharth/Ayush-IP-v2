@echo off
echo ===================================================
echo Starting AyushIP Frontend / Web Application
echo ===================================================

cd /d "%~dp0"

echo Starting Vite / Express dev server on http://localhost:3000 ...
call npm.cmd run dev

pause

