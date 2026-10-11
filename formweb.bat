@echo off
setlocal
cd /d "%~dp0"
set "FORMWEB_COMMAND=%~1"
if "%FORMWEB_COMMAND%"=="" set "FORMWEB_COMMAND=boot"
if /i "%FORMWEB_COMMAND%"=="install" goto install
if /i "%FORMWEB_COMMAND%"=="install-core" goto core
if /i "%FORMWEB_COMMAND%"=="install-backend" goto backend_install
if /i "%FORMWEB_COMMAND%"=="install-frontend" goto frontend_install
if /i "%FORMWEB_COMMAND%"=="build" goto build
if /i "%FORMWEB_COMMAND%"=="boot" goto boot
if /i "%FORMWEB_COMMAND%"=="dev" goto boot
if /i "%FORMWEB_COMMAND%"=="backend" goto backend
if /i "%FORMWEB_COMMAND%"=="frontend" goto frontend
if /i "%FORMWEB_COMMAND%"=="serve" goto serve
if /i "%FORMWEB_COMMAND%"=="mcp" goto mcp
if /i "%FORMWEB_COMMAND%"=="agents" goto agents
if /i "%FORMWEB_COMMAND%"=="comparisons" goto comparisons
if /i "%FORMWEB_COMMAND%"=="doctor" goto doctor
if /i "%FORMWEB_COMMAND%"=="help" goto help
if /i "%FORMWEB_COMMAND%"=="--help" goto help
echo [formweb] unknown command: %FORMWEB_COMMAND%
exit /b 2
:install
call setup\install.bat
exit /b %errorlevel%
:core
call setup\install_core.bat
exit /b %errorlevel%
:backend_install
call setup\install_backend.bat
exit /b %errorlevel%
:frontend_install
call setup\install_frontend.bat
exit /b %errorlevel%
:build
call setup\build.bat
exit /b %errorlevel%
:boot
call setup\boot.bat
exit /b %errorlevel%
:backend
call setup\boot_backend.bat
exit /b %errorlevel%
:frontend
call setup\boot_frontend.bat
exit /b %errorlevel%
:serve
call setup\serve.bat
exit /b %errorlevel%
:mcp
backend\venv\Scripts\python.exe setup\mcp_stdio.py
exit /b %errorlevel%
:agents
backend\venv\Scripts\python.exe setup\agents.py %2 %3 %4 %5
exit /b %errorlevel%
:comparisons
backend\venv\Scripts\python.exe setup\comparisons.py %2 %3 %4 %5
exit /b %errorlevel%
:doctor
call setup\doctor.bat
exit /b %errorlevel%
:help
echo formweb: install, install-core, install-backend, install-frontend, boot, backend, frontend, build, serve, mcp, agents sync, agents install, comparisons status, comparisons embed, doctor
exit /b 0
