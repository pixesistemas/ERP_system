const db = require("../../src/db/database");

/*
 * Modo sin conexión del POS: cola de operaciones hechas sin internet.
 *
 * Cada terminal guarda sus ventas en IndexedDB local (frontend) y las
 * envía al servidor al recuperar la conexión. El uuid viaja desde el
 * cliente y es único por empresa: sincronizar dos veces nunca duplica.
 * La tabla queda como auditoría de lo recibido, con el resultado de cada
 * operación aplicada.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS offline_operaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER,
    device_id TEXT,
    uuid TEXT NOT NULL,
    tipo TEXT NOT NULL,
    fecha_cliente TEXT,
    payload_json TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    resultado_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aplicado_at TEXT,
    UNIQUE (empresa_id, uuid)
  );

  CREATE INDEX IF NOT EXISTS idx_offline_operaciones_empresa
    ON offline_operaciones(empresa_id, estado);

  CREATE INDEX IF NOT EXISTS idx_offline_operaciones_fecha
    ON offline_operaciones(empresa_id, created_at);
`);

/*
 * Dispositivo/terminal del POS: se registra al sincronizar para poder ver
 * desde el servidor qué equipos están trabajando con cola offline y cuándo
 * hicieron su última sincronización (también sirve para diagnosticar).
 */
try {
  const cols = db.prepare("PRAGMA table_info(sync_dispositivos)").all().map((c) => c.name);
  if (!cols.includes("ultimo_pull")) {
    db.exec("ALTER TABLE sync_dispositivos ADD COLUMN ultimo_pull TEXT");
    console.log("096: sync_dispositivos.ultimo_pull agregada");
  }
  if (!cols.includes("origen")) {
    db.exec("ALTER TABLE sync_dispositivos ADD COLUMN origen TEXT DEFAULT 'MOVIL'");
    console.log("096: sync_dispositivos.origen agregada");
  }
} catch (e) {
  console.log("096: sync_dispositivos no existe todavía (se crea en 083)");
}

console.log("096: modo sin conexión del POS listo");
