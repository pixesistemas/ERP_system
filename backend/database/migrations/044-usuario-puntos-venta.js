const db = require("../../src/db/database");

/*
 * Asigna puntos de venta por usuario (para que cada operador trabaje con
 * sus PVs y numeraciones) y agrega logo por punto de venta para que cada
 * comprobante se imprima con la imagen de su propia bocacalle.
 */
const colsPv = db
  .prepare("PRAGMA table_info(puntos_venta)")
  .all()
  .map((c) => c.name);

if (!colsPv.includes("logo")) {
  db.exec(`ALTER TABLE puntos_venta ADD COLUMN logo TEXT`);
  console.log("Puntos de venta: columna logo agregada");
}

const tablas = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);

if (!tablas.includes("usuario_puntos_venta")) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuario_puntos_venta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      punto_venta_id INTEGER NOT NULL,
      predeterminado INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(empresa_id, usuario_id, punto_venta_id)
    )
  `);
  console.log("Tabla usuario_puntos_venta creada");
}