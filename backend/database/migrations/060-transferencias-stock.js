const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS transferencias_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    origen_id INTEGER,
    destino_id INTEGER,
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'CONFIRMADA',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transferencia_stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transferencia_id INTEGER NOT NULL,
    producto_id INTEGER,
    cantidad REAL NOT NULL DEFAULT 0
  );
`);
console.log("Tabla transferencias_stock creada");