@echo off
cd /d "%~dp0.."
call setup\install_core.bat || exit /b 1
call setup\install_backend.bat || exit /b 1
call setup\install_frontend.bat || exit /b 1
echo [formweb] installed; run formweb.bat boot
