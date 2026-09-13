# Automatizaciones con n8n

Workflows listos para importar en n8n (`https://n8n.pixesistemas.com.ar`).
Cada uno llama a un endpoint del ERP y el ERP hace el trabajo (enviar
WhatsApp, email, backup, etc.). El ERP respeta la configuración por empresa:
si el cliente no activó la automatización en **Configuración → Automatizaciones**,
el endpoint responde `{ skipped: true }` y no hace nada.

## Variables de entorno en n8n

Creá estas variables en n8n (Settings → Variables) o en su `.env`:

| Variable | Para qué |
|---|---|
| `ERP_BASE_URL` | Ej: `https://erp.pixesistemas.com.ar` |
| `ERP_API_KEY` | API Key de la empresa (tabla `empresas.api_key`) |
| `WHATSAPP_TOKEN` | Token de WhatsApp Cloud API (para workflows 01 y 08) |
| `WHATSAPP_PHONE_ID` | Phone ID de WhatsApp (para workflows 01 y 08) |
| `SUPERADMIN_WHATSAPP_TO` | Número de respaldo del superadmin |

> El ERP también puede enviar WhatsApp directo (config de WhatsApp por empresa).
> Los workflows 02–06 y 08 llaman al ERP, que ya envía el mensaje.

## Workflows

| Archivo | Disparador | Qué hace |
|---|---|---|
| `01-alertas-errores-superadmin.json` | Webhook `erp-alerta-error` | Reenvía por WhatsApp los errores 500 del ERP |
| `02-reporte-diario.json` | Cron 21:00 | Reporte de ventas/caja/stock por email |
| `03-stock-minimo.json` | Cron cada 4 h | Aviso de productos a reponer |
| `04-reintento-cae.json` | Cron cada 30 min | Reintenta CAE pendientes de AFIP |
| `05-cobranzas.json` | Cron 10:00 | Recordatorio de saldo a clientes |
| `06-conciliacion-pagos.json` | Webhook `mercadopago-pago` | Marca pagado y avisa |
| `07-backup-nube.json` | Cron 03:00 | Crea el backup y lo descarga (agregá Drive/S3) |
| `08-escalamiento-humano.json` | Webhook `erp-escalamiento` | Avisa a un vendedor cuando el bot no entiende |

## Endpoints del ERP para n8n

Todos con header `x-api-key: <API Key de la empresa>`:

```
GET  /api/v1/n8n/config
GET  /api/v1/n8n/reporte-diario
POST /api/v1/n8n/reporte-diario
GET  /api/v1/n8n/stock-minimo
POST /api/v1/n8n/stock-minimo/alertar
POST /api/v1/n8n/reintentar-cae
GET  /api/v1/n8n/cobranzas
POST /api/v1/n8n/cobranzas/enviar
POST /api/v1/n8n/conciliar-pago      body: { "externalId": "..." }
POST /api/v1/n8n/backup
GET  /api/v1/n8n/backup/descargar
POST /api/v1/n8n/avisar-reparto      body: { "documentoId": 123, "estado": "EN_CAMINO" }
POST /api/v1/n8n/escalar             body: { "telefono": "...", "mensaje": "..." }
```

## Variables de entorno del ERP (backend)

| Variable | Para qué |
|---|---|
| `N8N_ALERT_WEBHOOK_URL` | Webhook de n8n para alertas de error del sistema (workflow 01) |
| `N8N_ESCALAMIENTO_WEBHOOK_URL` | Webhook de n8n para escalamiento (workflow 08) |
| `N8N_WEBHOOK_SECRET` | Se envía como header `x-webhook-secret` |
| `ERROR_ALERTA_COOLDOWN_SEG` | Anti-spam por error (default 600 s) |
| `SUPERADMIN_WHATSAPP_TOKEN` / `SUPERADMIN_WHATSAPP_PHONE_ID` | Envío directo por Meta (alternativa a n8n) |

## Cómo importar

1. n8n → **Workflows** → **Import from File** → elegí el `.json`.
2. Abrí cada nodo HTTP y verificá la URL y el header `x-api-key`.
3. Activá el workflow (toggle arriba).
