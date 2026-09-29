@echo off
cd /d "%~dp0..\\backend"
python -m alembic upgrade head || exit /b 1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8003
