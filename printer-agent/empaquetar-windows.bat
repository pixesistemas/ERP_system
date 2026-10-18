@echo off
title Empaquetar agente como .exe
cd /d "%~dp0"
echo Generando pixe-print-agent.exe (la primera vez descarga herramientas)...
call npx --yes @yao-pkg/pkg server.js --targets node18-win-x64 --output pixe-print-agent.exe
if errorlevel 1 (
  echo.
  echo No se pudo empaquetar automaticamente.
  echo Alternativa manual: npx --yes pkg server.js -t node18-win-x64 -o pixe-print-agent.exe
  pause
  exit /b 1
)
echo.
echo Listo: pixe-print-agent.exe (se puede usar sin Node instalado).
echo Con iniciar-oculto.vbs arranca solo y sin ventana.
pause
