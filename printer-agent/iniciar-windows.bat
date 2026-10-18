@echo off
title PixeSistemas - Agente de impresion
cd /d "%~dp0"
node server.js
echo.
echo El agente se cerro. Presiona una tecla para salir.
pause > nul
