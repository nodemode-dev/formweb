@echo off
cd /d "%~dp0..\backend"
if not exist venv\Scripts\python.exe (echo [formweb] run formweb.bat install-backend first & exit /b 1)
if not defined FORMWEB_PORT set "FORMWEB_PORT=8240"
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port %FORMWEB_PORT%
exit /b %errorlevel%
