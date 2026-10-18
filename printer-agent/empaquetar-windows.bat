@echo off
title Empaquetar agente como .exe
cd /d "%~dp0"
echo Generando pixe-print-agent.exe (la primera vez descarga herramientas)...
echo.

call npx --yes @yao-pkg/pkg server.js --targets node22-win-x64 --output pixe-print-agent.exe
if not errorlevel 1 goto listo

echo Reintentando con Node 20...
call npx --yes @yao-pkg/pkg server.js --targets node20-win-x64 --output pixe-print-agent.exe
if not errorlevel 1 goto listo

echo Reintentando con Node 18...
call npx --yes @yao-pkg/pkg server.js --targets node18-win-x64 --output pixe-print-agent.exe
if not errorlevel 1 goto listo

echo.
echo No se pudo empaquetar automaticamente.
echo No es obligatorio: el agente funciona igual con Node instalado
echo (iniciar-con-bandeja.vbs detecta si existe el .exe o usa node).
pause
exit /b 1

:listo
echo.
echo Listo: pixe-print-agent.exe (se puede usar sin Node instalado).
echo Con iniciar-con-bandeja.vbs arranca solo, sin ventana y con icono
echo en la bandeja; instalar-inicio-automatico.bat lo deja al inicio.
pause
