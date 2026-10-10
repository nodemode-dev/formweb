@echo off
cd /d "%~dp0.."
call setup\install_frontend.bat
exit /b %errorlevel%
