@echo off
cd /d "%~dp0.."
if not exist native\target\release\formweb-core.exe (echo [formweb] run formweb.bat install-core first & exit /b 1)
start "formweb API" cmd /k call setup\boot_backend.bat
start "formweb editor" cmd /k call setup\boot_frontend.bat
echo [formweb] editor http://localhost:5240; API http://127.0.0.1:8240
