@echo off
setlocal
set "ROOT=%~dp0.."
set "WHICH=%~1"
if "%WHICH%"=="" set "WHICH=all"
set "REST=%2 %3 %4 %5 %6 %7 %8 %9"
set "FAIL=0"
set "KNOWN=0"
for %%L in (all unit engine native) do if /i "%WHICH%"=="%%L" set "KNOWN=1"
if "%KNOWN%"=="0" ( echo [formweb] unknown test layer: %WHICH% ^(use unit, engine, native or nothing for all^) & exit /b 2 )
set "DO=0"
if /i "%WHICH%"=="all" set "DO=1"
if /i "%WHICH%"=="native" set "DO=1"
if "%DO%"=="1" (
  where cargo >nul 2>&1 || ( echo [formweb] cargo is missing; install Rust from https://rustup.rs & exit /b 1 )
  echo [formweb] native engine ^(cargo test^)
  pushd "%ROOT%\native"
  cargo test --release --locked %REST% || set "FAIL=1"
  popd
)
set "DO=0"
if /i "%WHICH%"=="all" set "DO=1"
if /i "%WHICH%"=="engine" set "DO=1"
set "PY=%ROOT%\backend\venv\Scripts\python.exe"
if "%DO%"=="1" (
  if not exist "%PY%" ( echo [formweb] the backend venv is missing, run formweb.bat install-backend & exit /b 1 )
  "%PY%" -c "import pytest" >nul 2>&1 || ( echo [formweb] pytest is missing, run backend\venv\Scripts\python.exe -m pip install -r backend\requirements-test.txt & exit /b 1 )
  echo [formweb] backend ^(pytest^)
  pushd "%ROOT%\backend"
  "%PY%" -m pytest tests -q -p no:cacheprovider %REST% || set "FAIL=1"
  popd
)
set "DO=0"
if /i "%WHICH%"=="all" set "DO=1"
if /i "%WHICH%"=="unit" set "DO=1"
if "%DO%"=="1" (
  if not exist "%ROOT%\frontend\node_modules\vitest" ( echo [formweb] the frontend packages are missing, run formweb.bat install-frontend & exit /b 1 )
  echo [formweb] editor ^(vitest^)
  pushd "%ROOT%\frontend"
  call npx vitest run %REST% || set "FAIL=1"
  popd
)
exit /b %FAIL%
