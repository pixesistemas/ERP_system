# PixeSistemas - Agente de impresión

App chica que corre en la PC del local y permite que el ERP imprima en
impresoras térmicas **desde cualquier navegador**, sin modo kiosco, sin
diálogos de impresión y sin depender de la impresora predeterminada de
Windows.

- Escucha solo en `http://127.0.0.1:17777`.
- Recibe el ticket ya generado en ESC/POS y lo manda a la impresora:
  - **Red**: IP y puerto (habitualmente 9100). Impresoras con Ethernet/WiFi.
  - **Sistema**: una impresora instalada en la PC (USB u otra), enviando los
    bytes crudos con winspool en Windows y `lp -o raw` en Linux/macOS.
- Pide un **token** (se genera solo la primera vez en `config.json`).

## Instalación

### Opción A: con Node.js instalado (lo más simple)

1. Instalar Node.js LTS (https://nodejs.org) en la PC del local.
2. Copiar esta carpeta (`printer-agent`) a la PC.
3. Doble clic en `iniciar-windows.bat` (Windows) o `node server.js` (Linux/Mac).
4. La primera vez imprime en pantalla el **token**: copiarlo.

### Opción B: ejecutable único (sin Node instalado)

Doble clic en `empaquetar-windows.bat`: genera `pixe-print-agent.exe` en esta
misma carpeta (reintenta con Node 22, 20 y 18). Si la carpeta ya tiene el
`.exe`, los accesos de inicio lo usan automáticamente en lugar de Node.
El ejecutable guarda `config.json` y `agente.log` **al lado del .exe**.
Podés copiar solo esa carpeta con el `.exe` a las PCs de los clientes.

Equivale a:

```
npx @yao-pkg/pkg server.js --targets node22-win-x64 --output pixe-print-agent.exe
```

Para Linux/Mac usar `node22-linux-x64` / `node22-macos-x64`.

## Sin ventana, con icono en la bandeja y arranque automático

El agente está pensado para quedar corriendo de fondo, sin ninguna ventana
abierta y con un **icono junto al reloj** para controlarlo. Todo queda
registrado en `agente.log` (al lado del agente).

- **Iniciar con icono en la bandeja**: doble clic en
  `iniciar-con-bandeja.vbs`. El icono (clic izquierdo o derecho) tiene:
  - **Ver datos de conexión (token)** → ventana con la URL y el **token**
    para copiar con un botón.
  - **Copiar token al portapapeles**
  - Ver registro (`agente.log`)
  - Abrir carpeta del agente
  - Reiniciar agente
  - Detener y salir
- La **primera vez** que arranca, la bandeja abre sola la ventana con el
  token para que lo copies.
- **Arranque automático al iniciar Windows**: doble clic en
  `instalar-inicio-automatico.bat` (copia el inicio a la carpeta de Inicio
  del usuario). Para quitarlo: `desinstalar-inicio-automatico.bat`.
- **Cerrar un agente que está corriendo sin icono** (por ejemplo si se
  inició con `iniciar-oculto.vbs`): doble clic en `detener-agente.bat`, o
  desde el Administrador de tareas terminar el proceso `node.exe`. Si al
  abrir otra vez dice `EADDRINUSE ... 17777`, es que **ya hay uno
  corriendo** (no es un error).
- **Sin icono (modo mínimo)**: `iniciar-oculto.vbs` hace lo mismo que el de
  bandeja pero sin icono; para cerrarlo usar `detener-agente.bat`.
- Probalo primero con `iniciar-windows.bat` (con ventana) para ver el
  token y las impresoras; después pasá al modo con bandeja.

Alternativa por Programador de tareas: al iniciar sesión →
`wscript.exe "ruta\iniciar-con-bandeja.vbs"`.

## Inicio automático

- **Windows**: copiar un acceso a `iniciar-windows.bat` en la carpeta de
  Inicio (`Win+R` → `shell:startup`). Alternativa: Programador de tareas al
  iniciar sesión.
- **Linux (systemd)**: crear `/etc/systemd/system/pixe-print-agent.service`:

```
[Unit]
Description=PixeSistemas Agente de impresion
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/pixe-print-agent/server.js
Restart=on-failure
User=pixe

[Install]
WantedBy=multi-user.target
```

Luego: `sudo systemctl enable --now pixe-print-agent`.

- **macOS**: con `launchd`, un plist en `~/Library/LaunchAgents` apuntando a
  `node /ruta/server.js`.

## Configuración en el ERP

En **Configuración → Puntos de venta**:

- **Modo de impresión**: `Agente local`.
- **Conexión del agente**:
  - `A través del servidor (recomendado)`: el agente se conecta al ERP y
    retira los tickets de la cola. **Funciona con el ERP en internet,
    desde cualquier navegador y sin permisos especiales.** En la PC del
    local: icono de la bandeja → "Ver datos de conexión" → cargá la
    **URL del ERP** (ej. `https://erp.pixesistemas.com.ar`) → "Guardar URL
    del ERP y reiniciar".
  - `Directa (esta PC)`: el navegador le manda el ticket a `127.0.0.1`.
    Solo conviene cuando el ERP se abre en la misma PC o red local
    (Chrome bloquea este acceso desde webs de internet).
- **Tipo de impresora**: `Red` (IP + puerto) o `Instalada en el sistema`
  (nombre exacto de la impresora, ej. `POS-80`).
- **Token del agente**: el que muestra el agente (icono de la bandeja →
  "Ver datos de conexión" → "Copiar token").

El botón de **ticket de prueba** del punto de venta prueba toda la cadena
en el modo que esté configurado. Si el agente está apagado o falla, el POS
imprime igual por el navegador (respaldo automático) y avisa en pantalla.

## Diagnóstico

- **Probar desde el navegador**: abrir `http://127.0.0.1:17777/salud`.
  - Si muestra JSON → el agente responde.
  - Si **no carga** desde el ERP, dale permiso de **"red local"** al sitio
    web del ERP: clic en el candado/ajustes al lado de la dirección del
    navegador → Permisos → Red local → Permitir y recargar la página. Es un
    permiso nuevo de Chrome para que una web de internet pueda hablar con
    programas de la PC.
- `GET /impresoras` → lista las impresoras del sistema.
- `config.json` → puerto, token y tiempo de espera.
- `agente.log` → registro de arranques, impresiones y errores.
- El botón **Consultar agente** en Puntos de venta del ERP muestra versión,
  plataforma e impresoras, o avisa si no responde.
