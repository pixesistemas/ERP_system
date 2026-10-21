@echo off
cd /d "%~dp0"
if exist "%~dp0FoxVendedorSync.exe" (
  "%~dp0FoxVendedorSync.exe" >> sincronizacion.log 2>&1
  exit /b %errorlevel%
)
where node >nul 2>&1
if errorlevel 1 (
  echo [%date% %time%] No se encontro Node.js. Instalalo desde https://nodejs.org >> sincronizacion.log
  exit /b 1
)
node sincronizar.js >> sincronizacion.log 2>&1
