@echo off
title Instalar agente de impresion al inicio de Windows
cd /d "%~dp0"
set DEST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy /y "iniciar-con-bandeja.vbs" "%DEST%\PixeSistemas Agente de impresion.vbs" > nul
if errorlevel 1 (
  echo No se pudo copiar a la carpeta de inicio.
  pause
  exit /b 1
)
echo Listo: el agente va a arrancar solo al iniciar sesion, con el icono
echo en la bandeja (junto al reloj).
echo Para cerrarlo: clic derecho en el icono ^> "Detener y salir".
echo Para desinstalarlo del inicio: ejecuta desinstalar-inicio-automatico.bat
echo.
choice /c SN /m "Queres iniciarlo ahora mismo?"
if errorlevel 2 goto :fin
wscript "iniciar-con-bandeja.vbs"
:fin
pause
