# Deploy a producción con Docker + Portainer

Guía para subir la app (backend + frontend en un solo contenedor) y dejarla funcionando.

---

## 1. ¿Qué hay en el repo para el deploy?

| Archivo | Para qué sirve |
|---|---|
| `Dockerfile` | Multi-stage: buildea el frontend y arma la imagen con Node + Chromium (para PDF) |
| `docker-compose.yml` | Define el servicio `erp`, puertos, 2 volúmenes persistentes y el healthcheck |
| `.env.production.example` | Plantilla de variables para producción (copiala a `.env`) |
| `.dockerignore` | Evita subir node_modules, .db, storage, .env en el build |

La imagen expone el **puerto 3000** y sirve a la vez:
- la **API** (`/api/v1`), 
- el **frontend estático** (`/`),
- los **archivos generados** (`/storage`: PDF y QR de MercadoPago).

---

## 2. Flujo con git (cada cambio que hagas)

El proyecto ya es un repo git. Flujo recomendado:

```powershell
# 1) Trabajá siempre en una rama nueva
git checkout -b feature/nuevo-cambio

# 2) Hacé commits chiquitos y descriptivos
git add backend/scripts/seed-demo-pagos.js backend/package.json
git commit -m "agrega seed de pagos demo"

# 3) NO subir secretos ni la base. Verificá antes:
git status
git diff --cached

# 4) Subí la rama al repositorio remoto
git push -u origin feature/nuevo-cambio

# 5) Cuando está lista, mergeala a main (Pull Request o local)
git checkout main
git merge feature/nuevo-cambio
```

Recuerda: **`.env` y los archivos `.db` están ignorados** (no se suben).

---

## 3. Subir el código al servidor por primera vez

En tu servidor (con Git instalado):

```bash
git clone <URL_DEL_REPO> /opt/afip-conversacional
cd /opt/afip-conversacional
```

Para las siguientes actualizaciones:

```bash
cd /opt/afip-conversacional
git pull            # trae los últimos cambios
docker compose up -d --build   # reconstruye y levanta
```

---

## 4. Variables de entorno

En Portainer se cargan desde la sección **"Environment variables"** del Stack (no hace falta un `.env` en el servidor, porque el compose ya las define con valores por defecto).

Obligatoria (sin esto no arranca):
- `JWT_SECRET`: una clave larga y única (ej: `GeneraUnaClaveDeAlMenos32Chars!`)

Importantes para producción:
- `DEMO_MODE=false`
- `AFIP_PRODUCTION=true`
- `OPENSSL=openssl`
- `PUBLIC_BASE_URL=https://erp.midominio.com.ar` (sin barra final). **Obligatorio** para que los QR/PDF tengan URL pública.
- MercadoPago (pago real): `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_POS_ID`. Si quedan vacíos, el asistente genera un QR simulado (modo demo).

El resto tiene valores por defecto seguros (`PORT=3000`, `TZ`, `DB_PATH`, `JWT_EXPIRES_IN`, `AI_*`).

---

## 5. Levantar con Portainer

Tenés dos caminos: **Stack (recomendado)** o **Contenedor simple**.

### Opción A — Stack desde Git (recomendado)

1. En Portainer: **Stacks → Add stack**.
2. Nombre: `afip-erp`.
3. En **"Build method"** elegí **"Repository"** (Git) y pegá la URL del repo (`https://github.com/pixesistemas/ERP_system.git`), rama `main` y ruta del compose: `docker-compose.yml`.
4. En la sección **"Environment variables"** definí al menos `JWT_SECRET` (y `PUBLIC_BASE_URL` cuando tengas el dominio).
5. **Deploy the stack**.

Portainer clona el repo, **buildea la imagen** (frontend + backend + Chromium) y crea los **2 volúmenes** (`erp_data`, `erp_storage`).
- `erp_data` → base de datos SQLite `/app/data/afip_api.db`
- `erp_storage` → PDFs y QR `/app/backend/storage`

> El build tarda unos minutos (npm install + Chromium). Si querés actualizar después de un cambio en Git: **Stack → Update → Pull and redeploy** (reconstruye la imagen con `--build`).

### Opción B — Contenedor simple

Si preferís no usar Stack, creá un contenedor desde la imagen con los mismos volúmenes y variables. Igual necesitás tener la imagen buildeada (el Stack de Git es la forma más simple de obtenerla).

---

## 6. Verificar que quedó funcionando

```bash
# healthcheck (respuesta del API)
curl http://localhost:3000/health

# logs del contenedor
docker compose logs -f
```

Los logs deben mostrar algo como:

```
[DB] Lista: 101 tablas. Admin: admin@empresa.com
Servidor iniciado en puerto 3000
```

---

## 7. Exponer la app a internet (reverso proxy + HTTPS)

Para que los **webhooks de WhatsApp** y **MercadoPago** funcionen, el servidor tiene que ser alcanzable desde internet con HTTPS. Opciones:

- **NGINX (instalado en el server)** como reverse proxy de `localhost:3000`, con certificado (Let's Encrypt).
- O un dominio + túnel (Cloudflare Tunnel / ngrok) para pruebas.

Luego ajustá en `.env`:

```ini
PUBLIC_BASE_URL=https://erp.midominio.com.ar
MERCADOPAGO_WEBHOOK_URL=https://erp.midominio.com.ar/api/v1/pagos/webhook/mercadopago
```

Y configurá en el panel de MercadoPago que el webhook de pago apunte ahí.

---

## 8. Importante: datos y seguridad

- **La base no se sube al contenedor**: vive en el volumen `erp_data`. Las **migraciones** más el **seed** de datos mínimos se corren automáticamente al arrancar el servidor.
- ⚠️ **Administrador por defecto:** el seed crea `admin@empresa.com` / `admin123`. **Cambiá la contraseña apenas arranques** (o quitá la llamada a `seedDemo` en `src/db/bootstrap.js` si no querés que se reseteé en producción).
- **Respaldos**: copiá el archivo del volumen `erp_data` (o usá `.backup` de SQLite) con frecuencia. Los PDF/QR están en `erp_storage`; respaldá también esa carpeta.

---

## 9. Cómo se ve el flujo de pago (demo)

1. Los clientes escriben por WhatsApp cosas como *"mandame el link de pago"*, *"cobrale con mercado pago"*, *"generame el qr para pagar"*.
2. El asistente genera el **QR de MercadoPago** y lo envía como imagen (`SEND_IMAGE`).
3. El cliente lo escanea, paga el monto, y el webhook de MP marca el cobro como `PAGADO`.

Para resetear la demo de pagos en cualquier momento:

```bash
# dentro del contenedor
docker exec -it <contenedor> node scripts/seed-demo-pagos.js
```
