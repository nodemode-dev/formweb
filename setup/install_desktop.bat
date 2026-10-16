@echo off
cd /d "%~dp0.."
call setup\install_backend.bat || exit /b 1
backend\venv\Scripts\python.exe -m pip install -r backend\requirements_desktop.txt || exit /b 1
where cargo >nul 2>nul || ( echo [formweb] Rust is needed: https://rustup.rs & exit /b 1 )
echo [formweb] desktop toolchain ready
