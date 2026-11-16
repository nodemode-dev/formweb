@echo off
setlocal
cd /d "%~dp0..\native"
where cargo >nul 2>nul || (echo [formweb] Rust is missing; install Rust stable from rustup.rs & exit /b 1)
if exist Cargo.lock (
  cargo build --release --locked -p formweb-core
) else (
  cargo build --release -p formweb-core
)
exit /b %errorlevel%
