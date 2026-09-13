const db = require("../../src/db/database");

/*
 * Registro persistente de errores de la API para diagnóstico desde el
 * panel de superadmin. Guarda sólo metadatos del error (no el cuerpo del
 * request) para no almacenar claves ni datos sensibles.
 */

const tabla = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'")
  .get();

if (!tabla) {
  db.exec(`
    CREATE TABLE error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metodo TEXT,
      ruta TEXT,
      status INTEGER,
      codigo TEXT,
      mensaje TEXT,
      stack TEXT,
      usuario_id INTEGER,
      empresa_id INTEGER,
      ip TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_error_logs_fecha ON error_logs(fecha)");
  console.log("Tabla error_logs creada.");
} else {
  console.log("Tabla error_logs ya existía.");
}
