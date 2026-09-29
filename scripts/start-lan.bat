@echo off
cd /d "%~dp0.."
if exist "backend\.venv\Scripts\python.exe" (
  "backend\.venv\Scripts\python.exe" "scripts\start_lan.py"
) else (
  python "scripts\start_lan.py"
)
if errorlevel 1 pause
