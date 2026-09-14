const db = require("../../src/db/database");

/*
 * Cierre de la versión Beta 2.3: actualiza la versión del sistema y registra
 * las novedades (automatizaciones + correcciones) en la tabla `changelog`
 * que muestra el panel del superadmin. Es idempotente: no duplica entradas.
 */

const VERSION = "4.0.0-beta.2.3";
const FECHA = "2026-09-14";

db.prepare(
  `INSERT INTO sistema_version(id,version,updated_at) VALUES(1,?,CURRENT_TIMESTAMP)
   ON CONFLICT(id) DO UPDATE SET version=excluded.version, updated_at=CURRENT_TIMESTAMP`,
).run(VERSION);

const NOVEDADES = [
  ["MEJORA", "Automatizaciones configurables por empresa", "Reporte diario, stock mínimo, reintento de CAE, cobranzas, backup, aviso de reparto y escalamiento, activables desde Configuración."],
  ["MEJORA", "Notificaciones centrales y alertas al superadmin", "WhatsApp y email unificados; aviso de errores 500 con anti-spam."],
  ["CORRECCION", "Backup consistente y protegido", "Snapshot con db.backup() y endpoints en /api/v1/backup con clave dedicada BACKUP_API_KEY."],
  ["CORRECCION", "Recordatorio de cobranzas respeta los días configurados", "Sólo avisa a clientes sin movimientos en los últimos N días."],
  ["CORRECCION", "conciliar-pago valida el link de pago", "Devuelve ok:false si el externalId no existe."],
];

const existe = db.prepare("SELECT id FROM changelog WHERE version=? AND titulo=? LIMIT 1");
const insertar = db.prepare(
  "INSERT INTO changelog(version,fecha,tipo,titulo,detalle) VALUES(?,?,?,?,?)",
);
let creadas = 0;
for (const [tipo, titulo, detalle] of NOVEDADES) {
  if (!existe.get(VERSION, titulo)) {
    insertar.run(VERSION, FECHA, tipo, titulo, detalle);
    creadas += 1;
  }
}

console.log(`sistema_version actualizada a ${VERSION} (changelog: ${creadas} entradas nuevas).`);
