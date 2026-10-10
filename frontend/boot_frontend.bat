@echo off
cd /d "%~dp0.."
call setup\boot_frontend.bat
exit /b %errorlevel%
