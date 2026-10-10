@echo off
cd /d "%~dp0.."
call setup\install_core.bat || exit /b 1
cd frontend
call npm run build || exit /b 1
cd ..\backend
venv\Scripts\python.exe -m compileall -q app || exit /b 1
echo [formweb] built; run formweb.bat serve
