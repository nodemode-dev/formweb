@echo off
cd /d "%~dp0.."
if not exist frontend\dist\index.html (echo [formweb] run formweb.bat build first & exit /b 1)
if not exist backend\venv\Scripts\python.exe (echo [formweb] run formweb.bat install-backend first & exit /b 1)
if not defined FORMWEB_PORT set "FORMWEB_PORT=8240"
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %FORMWEB_PORT%
exit /b %errorlevel%
