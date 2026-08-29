const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS vendedor_comisiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    vendedor_id INTEGER NOT NULL,

    origen_tipo TEXT NOT NULL,
    origen_id INTEGER,

    cliente_doc TEXT,
    cliente_nombre TEXT,

    base_calculo REAL NOT NULL DEFAULT 0,
    porcentaje REAL NOT NULL DEFAULT 0,
    importe REAL NOT NULL DEFAULT 0,

    estado TEXT NOT NULL DEFAULT 'PENDIENTE',

    observaciones TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
  );
`);

console.log("Comisiones de vendedores creadas");
