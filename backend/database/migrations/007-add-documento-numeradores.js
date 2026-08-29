const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS documento_numeradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    punto_venta INTEGER NOT NULL DEFAULT 1,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    UNIQUE (empresa_id, tipo, punto_venta),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );
`);

console.log("Tabla documento_numeradores creada");
