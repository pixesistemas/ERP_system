@echo off
title Detener agente de impresion
echo Deteniendo la bandeja (si esta abierta)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bandeja.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" > nul 2>&1
echo Deteniendo el agente (puerto 17777)...
set ENCONTRADO=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":17777" ^| findstr LISTENING') do (
  echo   Proceso %%p
  taskkill /PID %%p /F > nul 2>&1
  set ENCONTRADO=1
)
if not defined ENCONTRADO echo   No habia ningun agente corriendo.
echo Listo.
pause
