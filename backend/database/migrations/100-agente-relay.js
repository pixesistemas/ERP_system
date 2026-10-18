const db = require("../../src/db/database");

/*
 * Impresión por agente conectado al servidor (relay).
 *
 * En vez de que el navegador hable con 127.0.0.1 (bloqueado por Chrome
 * cuando el ERP está en internet), el agente consulta al ERP cada pocos
 * segundos y retira los trabajos de impresión. El servidor arma el ticket
 * ESC/POS y lo deja en la cola; el agente lo imprime y avisa el resultado.
 */

const cols = db.prepare("PRAGMA table_info(puntos_venta)").all().map((c) => c.name);
if (!cols.includes("agente_conexion")) {
  db.exec("ALTER TABLE puntos_venta ADD COLUMN agente_conexion TEXT NOT NULL DEFAULT 'LOCAL'");
  console.log("100: puntos_venta.agente_conexion agregada");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS agentes_impresion (
    token TEXT PRIMARY KEY,
    empresa_id INTEGER,
    ultima_conexion TEXT,
    plataforma TEXT,
    version TEXT
  );

  CREATE TABLE IF NOT EXISTS trabajos_impresion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER,
    token TEXT NOT NULL,
    punto_venta INTEGER,
    descripcion TEXT,
    datos_base64 TEXT NOT NULL,
    impresora_json TEXT NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tomado_at TEXT,
    resuelto_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trabajos_impresion_token
    ON trabajos_impresion(token, estado);
  CREATE INDEX IF NOT EXISTS idx_trabajos_impresion_empresa
    ON trabajos_impresion(empresa_id, created_at);
`);

console.log("100: relay de impresión por agente listo");
