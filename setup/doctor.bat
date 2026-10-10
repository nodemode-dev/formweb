@echo off
cd /d "%~dp0.."
if exist backend\venv\Scripts\python.exe (
  backend\venv\Scripts\python.exe setup\doctor.py
) else (
  py -3 setup\doctor.py
)
exit /b %errorlevel%
