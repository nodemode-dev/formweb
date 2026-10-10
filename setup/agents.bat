@echo off
cd /d "%~dp0.."
backend\venv\Scripts\python.exe setup\agents.py %*
exit /b %errorlevel%
