@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
set "ROOT=%CD%"
set "PY=%ROOT%\backend\venv\Scripts\python.exe"
"%PY%" -c "import PyInstaller" 2>nul || ( echo [formweb] PyInstaller is missing; run setup\install_desktop.bat & exit /b 1 )
set "TRIPLE=%FORMWEB_TARGET%"
if not defined TRIPLE for /f "tokens=2" %%T in ('rustc -vV ^| findstr /b "host:"') do set "TRIPLE=%%T"
if not defined TRIPLE ( echo [formweb] rustc not found; install Rust or set FORMWEB_TARGET & exit /b 1 )
if not exist "%ROOT%\native\target\release\formweb-core.exe" call setup\install_core.bat || exit /b 1
if not exist "%ROOT%\frontend\dist\index.html" ( pushd frontend & call npm run build & popd )
cd backend
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
set "WINDOWED=--noconsole"
if "%FORMWEB_ENGINE_WINDOWED%"=="0" set "WINDOWED="
"%PY%" -m PyInstaller --noconfirm --clean --onefile %WINDOWED% --name formweb-engine ^
  --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --paths "%ROOT%\backend" ^
  --add-data "%ROOT%\frontend\dist;frontend_dist" ^
  --add-data "%ROOT%\backend\app\stock;app\stock" ^
  --add-data "%ROOT%\library;library" ^
  --add-binary "%ROOT%\native\target\release\formweb-core.exe;bin" ^
  --collect-submodules app --collect-submodules uvicorn --collect-data mcp --exclude-module mcp.cli --hidden-import winpty --collect-submodules keyring --copy-metadata keyring ^
  "%ROOT%\backend\formweb_engine.py" || exit /b 1
dist-engine\formweb-engine.exe --selfcheck || ( echo [formweb] the frozen engine failed its selfcheck & exit /b 1 )
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formweb-engine.exe "%ROOT%\src-tauri\binaries\formweb-engine-%TRIPLE%.exe" >nul
echo [formweb] sidecar ready: src-tauri\binaries\formweb-engine-%TRIPLE%.exe
