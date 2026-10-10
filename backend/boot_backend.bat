@echo off
cd /d "%~dp0.."
call setup\boot_backend.bat
exit /b %errorlevel%
