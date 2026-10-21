# Fox Vendedor

App móvil independiente para vendedores: consulta de precios y armado de presupuestos usando los artículos del sistema Visual FoxPro/MariaDB (`base5`).

No comparte código, base ni sesiones con el ERP AFIP Conversacional. Todo vive en esta carpeta.

## Cómo funciona

```
Celular (PWA)  ─────────►  API Fox Vendedor (Node + SQLite)
                                  ▲
                                  │ HTTPS + clave de sincronización
                                  │
PC del local  ── Agente Node ─────┘
                    │
                    ▼
             MariaDB base5
             articulos / compro / detcompro
```

- La app **no se conecta directo a MariaDB**. Consulta la API propia.
- El **agente** corre en la PC que tenga acceso a MariaDB. Una vez por día:
  1. Lee `articulos` y actualiza el catálogo de la app.
  2. Busca presupuestos pendientes hechos desde el celular.
  3. Los inserta en `compro` + `detcompro` con número nuevo.
  4. Marca el presupuesto como sincronizado.
- El celular guarda un token de larga duración. El vendedor solo ingresa **una vez** un código de 8 dígitos generado por el administrador.

## Estructura

```
fox-vendedor/
  server/             API + app móvil (PWA)
    public/           HTML, CSS y JS de la app
    src/              API, autenticación y base SQLite
    scripts/          Generador de códigos de acceso
    data/             Base SQLite (se crea sola, no se versiona)
  agente/             Programa de sincronización con Fox/MariaDB
    sincronizar.js
    mapeo.js
    config.example.json
    sincronizar.bat
    instalar-tarea.ps1
```

## Requisitos

- Servidor de la app: Node.js 20 o superior. Para publicarla en internet, HTTPS (por ejemplo un subdominio `vendedor.tudominio.com` con Nginx/Caddy).
- PC del agente: Node.js 20 o superior y acceso a MariaDB `base5`. También se puede usar el ejecutable `FoxVendedorSync.exe` (no requiere Node instalado).
- Celular: Chrome/Safari actualizado. Se puede instalar como app desde el navegador (Agregar a pantalla de inicio).

## 1. Poner la API

```powershell
cd fox-vendedor/server
npm install
Copy-Item .env.example .env
# Editar .env:
#   PORT=3100
#   SYNC_KEY=una-clave-larga-y-dificil
#   TOKEN_DIAS=365
npm start
```

Abrí `http://localhost:3100/api/salud` para comprobar que responde.

Para producción se recomienda dejarlo detrás de HTTPS. La URL pública (por ejemplo `https://vendedor.tudominio.com`) es la que se usa en el celular y en el agente.

### Subirlo con Portainer

El stack está en `fox-vendedor/docker-compose.yml`. No modifica el stack del ERP.

1. En Portainer: **Stacks → Add stack**.
2. Build method: **Repository**.
3. Repositorio: el mismo repo del ERP, rama `main`.
4. Compose path: `fox-vendedor/docker-compose.yml`.
5. En **Environment variables** definir:
   - `SYNC_KEY`: una clave larga y única (la misma que uses en el agente).
   - `FOX_PORT`: puerto del host, por defecto `3200` (el ERP ya usa 3100).
   - `TOKEN_DIAS`: opcional, por defecto `365`.
6. **Deploy the stack**. Portainer buildea la imagen y crea el volumen `fox_vendedor_data` para SQLite.

La API queda escuchando dentro del contenedor en `3100` y publicada en el host en `3200` (o el `FOX_PORT` elegido). Para usar la app desde los celulares y poder instalarla como PWA, apuntá un dominio con HTTPS a `http://IP_DEL_SERVIDOR:3200` usando el proxy que ya tengas (Nginx, Traefik, Nginx Proxy Manager, Cloudflare Tunnel, etc.).

Crear un código de acceso dentro del contenedor:

```bash
docker exec -it fox-vendedor node scripts/crear-codigo.js --nombre "Vendedor 1"
```

Comprobar salud y logs:

```bash
curl http://localhost:3200/api/salud
docker logs -f fox-vendedor
```

Backup del volumen:

```bash
docker run --rm -v fox_vendedor_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/fox-vendedor-data.tgz -C /data .
```

El **agente** no hace falta subirlo a Portainer: va en la PC donde esté FoxPro/MariaDB, porque es el que tiene acceso a esa base. Como tu MySQL es local, el agente debe correr en esa misma PC (`host: 127.0.0.1`). En `agente/config.json` poné como `app.url` la URL pública de la app (por ejemplo `https://vendedor.tudominio.com`) y la misma `SYNC_KEY`. Solo si el contenedor de Portainer tuviera acceso directo a MySQL se podría agregar como servicio aparte.


### Crear un código de acceso

Con el servidor en marcha:

```powershell
cd fox-vendedor/server
npm run codigo -- --nombre "Vendedor 1" --dias 1
```

También se puede generar desde el agente (recomendado si el servidor está remoto):

```powershell
cd fox-vendedor/agente
node sincronizar.js --codigo "Vendedor 1"
```

El código vence en el plazo indicado, se usa **una sola vez** y deja la sesión iniciada en ese celular durante `TOKEN_DIAS` días. Si el vendedor cierra sesión o borra los datos del navegador, hay que generar otro código.

## 2. Instalar la app en el celular

1. Abrir la URL de la app en el celular.
2. Ingresar el código de 8 dígitos.
3. Opcional: menú del navegador → **Agregar a pantalla de inicio**.
4. Buscar por descripción, código o código de barras; elegir lista de precios; agregar artículos; completar cliente y enviar el presupuesto.

La app permite:
- Consultar precio final (IVA incluido) de las listas 1 a 4 (`pfinal1`...`pfinal4`).
- Ver stock informado por FoxPro.
- Armar un presupuesto y ver el historial con su estado (pendiente / cargado en Fox / error).

## 3. Configurar el agente

```powershell
cd fox-vendedor/agente
npm install
Copy-Item config.example.json config.json
```

Completar `config.json`:

```json
{
  "app": {
    "url": "https://vendedor.tudominio.com",
    "sync_key": "la-misma-clave-que-SYNC_KEY-del-servidor"
  },
  "fox": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "USUARIO_MYSQL",
    "password": "CLAVE_MYSQL",
    "database": "base5"
  },
  "presupuesto": {
    "pv": 1,
    "letra": "P",
    "tipo": "PRESUPUESTO",
    "tipodoc": "99",
    "idvendedor": 0
  }
}
```

`config.json` contiene la clave de la base: no se versiona y debe quedar solo en la PC del local.

**Si MySQL/MariaDB está instalado en la misma PC que FoxPro (tu caso):** dejá `host` en `127.0.0.1` y el puerto real de MySQL (normalmente `3306`). El agente corre en esa PC y se conecta localmente; la app que está en Portainer no necesita acceder a MySQL. Usá el usuario/clave de MySQL que tenga permiso sobre `base5`.

El agente debe ejecutarse en la PC local. Si además Portainer está en esa misma PC, podés usar `http://127.0.0.1:3200` como `app.url`; si Portainer está en un servidor, usá la URL pública HTTPS de la app.

Primera prueba manual:

```powershell
node sincronizar.js
```

Debería mostrar la cantidad de artículos y los presupuestos pendientes. Revisar `sincronizacion.log` si se ejecuta con el `.bat`.

### Versión ejecutable (sin Node)

La carpeta `FoxVendedor-Agente` (y `FoxVendedor-Agente.zip`) contiene `FoxVendedorSync.exe`. Se copia `config.example.json` a `config.json` al lado del `.exe`, se completa y se ejecuta `sincronizar.bat`. El `.exe` ya incluye Node y las dependencias.

Para ejecutarlo manualmente:

```powershell
cd C:\ruta\FoxVendedor-Agente
.\FoxVendedorSync.exe
```

Para generar un código desde el ejecutable:

```powershell
.\FoxVendedorSync.exe --codigo "Vendedor 1"
```

### Programar una vez por día

Ejecutar `instalar-tarea.bat` (o `instalar-tarea.ps1`). Crea una tarea de Windows todos los días a las 08:00 que ejecuta `sincronizar.bat` (usa el `.exe` si está presente o Node si no). Si Windows pide permisos de administrador, ejecutarlo como administrador.

También se puede cambiar la hora desde el Programador de tareas de Windows. El agente:
- Reemplaza el catálogo completo en cada sincronización (si un artículo se borra en Fox, deja de aparecer en la app).
- Solo envía artículos con `venta = 1`.
- Envía hasta 100 presupuestos pendientes por corrida.

## Qué escribe en FoxPro

Cada presupuesto web se inserta en:

- `compro`: `compro='PRESUPUESTO'`, `letra='P'`, `pv` configurado, `numero = máximo + 1`, `tipodoc='99'`, `escf=1`, datos del cliente y totales. El estado se deja vacío como en los presupuestos existentes (se puede cambiar con `presupuesto.estado` en `config.json`).
- `detcompro`: un renglón por artículo con `idart`, código, descripción, cantidad, precio final (`puni`/`ptotal`), IVA y neto discriminado.

El número se calcula con el máximo existente para ese `compro` y `pv`. El agente debe ser el único que genere presupuestos web para evitar carreras de numeración.

## Copias de seguridad

- Respaldar `fox-vendedor/server/data/fox-vendedor.db` (SQLite) o la carpeta `data/`.
- Respaldar `agente/config.json` en un lugar seguro.
- Los tokens y códigos se guardan hasheados en SQLite.

## Pruebas

```powershell
cd fox-vendedor/server
npm test

cd ../agente
npm test
```

## Notas

- La app usa `localStorage` **solo** para el token del vendedor y la lista de precios elegida. Es un proyecto independiente del ERP.
- No hay conexión directa a MariaDB desde el celular.
- Si la app se publica en HTTPS, el navegador permite instalarla como PWA. En HTTP normal sigue funcionando como web, pero no se instala igual.
- Si el precio final de una lista está en cero, la app usa la lista 1 como respaldo.
