const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS cupones_sorteo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    regla_id INTEGER,
    numero INTEGER NOT NULL,
    venta_id INTEGER,
    cliente_nombre TEXT,
    fecha_entrega TEXT,
    estado TEXT NOT NULL DEFAULT 'ENTREGADO',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("Tabla cupones_sorteo creada");