@echo off
cd /d "%~dp0"
call setup\install.bat
exit /b %errorlevel%
