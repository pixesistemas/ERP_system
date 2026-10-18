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

Con [pkg](https://github.com/vercel/pkg) o Node SEA:

```
npx pkg server.js --targets node18-win-x64 --output pixe-print-agent.exe
```

Para Linux/Mac usar `node18-linux-x64` / `node18-macos-x64`. El ejecutable
genera su `config.json` al lado cuando arranca.

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
- **Tipo de impresora**: `Red` (IP + puerto) o `Instalada en el sistema`
  (nombre exacto de la impresora, ej. `POS-80`).
- **URL del agente**: `http://127.0.0.1:17777` (por defecto).
- **Token del agente**: el que muestra el agente al iniciar.

El botón de **ticket de prueba** del punto de venta prueba toda la cadena.
Si el agente está apagado o falla, el POS imprime igual por el navegador
(respaldo automático) y avisa en pantalla.

## Diagnóstico

- `GET http://127.0.0.1:17777/salud` → el agente está vivo.
- `GET http://127.0.0.1:17777/impresoras` → lista las impresoras del sistema.
- `config.json` → puerto, token y tiempo de espera.
- Los errores de impresión aparecen en la consola del agente y en el POS.
