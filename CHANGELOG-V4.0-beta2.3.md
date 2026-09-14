# V4.0 Beta 2.3

## Automatizaciones configurables por empresa

- Panel **Configuración → Automatizaciones** con flags por empresa: reporte
  diario por email, alertas de stock mínimo, reintento de CAE, recordatorio de
  cobranzas, backup, aviso de reparto y escalamiento a humano.
- El ERP sólo ejecuta la automatización si el flag está activo; si no,
  responde `{ skipped: true }`.
- Endpoints expuestos dos veces: `/api/v1/automatizaciones` (JWT, panel del
  cliente) y `/api/v1/n8n` (API Key de la empresa, para n8n).

## Notificaciones centrales

- `notificacion.service.js`: envío unificado de WhatsApp (config de la
  empresa o superadmin) y email.
- Alertas de errores 500 del sistema al WhatsApp del superadmin, con
  anti-spam por firma de error (`ERROR_ALERTA_COOLDOWN_SEG`, default 600 s).

## Backups

- El backup usa `db.backup()` de better-sqlite3: snapshot consistente aunque
  haya escrituras concurrentes (antes se copiaba el archivo vivo con
  `fs.copyFileSync`, con riesgo de corrupción).
- Los endpoints de backup se separan a `/api/v1/backup` y exigen la clave
  dedicada `BACKUP_API_KEY` (header `x-backup-key`). Ya no son accesibles con
  la API Key de una empresa, porque el archivo contiene datos de todas las
  empresas.

## Correcciones

- El recordatorio de cobranzas ahora respeta `auto_cobranzas_dias`: sólo avisa
  a clientes sin movimientos en los últimos N días.
- `conciliar-pago` devuelve `ok: false` si el link de pago no existe, en lugar
  de simular una acreditación.
- El aviso al superadmin busca el primer número configurado en lugar de
  depender de un usuario fijo.

## Workflows n8n

- 8 workflows listos para importar en `n8n/workflows/`.
- El workflow de backup (`07`) usa `ERP_BACKUP_KEY` / `x-backup-key`.

## Base y pruebas

- Migración `077-version-beta2.3.js`: actualiza `sistema_version` y registra
  las novedades en la tabla `changelog`.
- Verificación: `npm run db:check`, `npm run audit:normalized`,
  `npm run test:beta2`, `npm run audit:no-local-storage` y `npm run build`.
