@echo off
title Quitar agente de impresion del inicio de Windows
set DEST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
del "%DEST%\PixeSistemas Agente de impresion.vbs" > nul 2>&1
echo Listo: el agente ya no arranca solo al iniciar sesion.
echo (Para cerrar uno que este corriendo ahora: usa el icono de la bandeja
echo  o ejecuta detener-agente.bat)
pause
