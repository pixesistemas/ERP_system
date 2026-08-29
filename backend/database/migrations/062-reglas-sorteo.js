const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS reglas_sorteo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    min_amount REAL NOT NULL DEFAULT 0,
    coupons INTEGER NOT NULL DEFAULT 1,
    fecha_sorteo TEXT,
    premio TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("Tabla reglas_sorteo creada");