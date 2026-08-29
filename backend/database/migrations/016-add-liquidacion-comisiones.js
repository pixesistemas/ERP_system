const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS vendedor_liquidaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    vendedor_id INTEGER NOT NULL,

    fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    importe_total REAL NOT NULL DEFAULT 0,

    estado TEXT NOT NULL DEFAULT 'CONFIRMADA',

    observaciones TEXT,
    usuario_id INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
  );
`);

console.log("Liquidaciones de comisiones creadas");
