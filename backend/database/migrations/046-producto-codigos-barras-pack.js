const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS producto_codigos_barras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    codigo_barra TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, codigo_barra)
  );
  CREATE INDEX IF NOT EXISTS idx_producto_codigos_barras_producto
    ON producto_codigos_barras (empresa_id, producto_id);
`);