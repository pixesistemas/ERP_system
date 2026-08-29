const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    deposito_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,

    documento_tipo TEXT,
    documento_id INTEGER,

    cantidad REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'ACTIVA',

    observaciones TEXT,
    usuario_id INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (deposito_id) REFERENCES depositos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );
`);

console.log("Reservas de stock creadas");
