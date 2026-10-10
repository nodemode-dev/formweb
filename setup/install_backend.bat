@echo off
cd /d "%~dp0..\backend"
if not exist venv\Scripts\python.exe py -3 -m venv venv
if not exist venv\Scripts\python.exe exit /b 1
venv\Scripts\python.exe -m pip install --upgrade pip || exit /b 1
venv\Scripts\python.exe -m pip install -r requirements.txt
exit /b %errorlevel%
