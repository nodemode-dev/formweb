@echo off
cd /d "%~dp0.."
call setup\install_backend.bat
exit /b %errorlevel%
