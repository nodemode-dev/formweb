@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "OPEN=0"
for %%A in (%*) do (
  if /i "%%~A"=="--open" ( set "OPEN=1" ) else if /i "%%~A"=="--help" ( goto :usage ) else if /i "%%~A"=="-h" ( goto :usage ) else ( call :usage & exit /b 2 )
)

echo.
echo [formweb] == checking the tools
where python >nul 2>nul || ( echo [formweb] Python 3.12 or newer is needed: https://www.python.org/downloads/ & exit /b 1 )
where node >nul 2>nul || ( echo [formweb] Node 22.12 or newer is needed: https://nodejs.org & exit /b 1 )
where cargo >nul 2>nul || ( echo [formweb] Rust is needed: https://rustup.rs & exit /b 1 )
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do if %%V LSS 22 ( echo [formweb] Node 22.12 or newer is needed, this is Node %%V & exit /b 1 )
where claude >nul 2>nul && ( echo [formweb] Claude Code found; the app's agent dock can start it ) || ( echo [formweb] Claude Code is not installed; the app builds without it: https://claude.com/claude-code )

echo.
echo [formweb] == installing the engine, the API and the editor
call setup\install.bat || goto :failed

echo.
echo [formweb] == installing the desktop packages
call setup\install_desktop.bat || goto :failed

echo.
echo [formweb] == building the engine and the editor
call setup\build.bat || goto :failed

echo.
echo [formweb] == freezing the API into the app's sidecar
call setup\freeze_backend.bat || goto :failed

echo.
echo [formweb] == building the desktop app (the first build compiles several hundred Rust crates)
pushd src-tauri
call npx --yes @tauri-apps/cli@2 build --config "{\"bundle\":{\"externalBin\":[\"binaries/formweb-engine\"]}}" || ( popd & goto :failed )
popd

echo.
echo [formweb] done. The installers are in src-tauri\target\release\bundle (msi and nsis)
if "%OPEN%"=="1" start "" "src-tauri\target\release\bundle"
exit /b 0

:failed
echo.
echo [formweb] the build stopped at the step above; fix what it says and run build_app.bat again
exit /b 1

:usage
echo build_app.bat           build formweb's desktop app on Windows, start to finish
echo   --open                open the folder with the installers when the build is done
exit /b 0
