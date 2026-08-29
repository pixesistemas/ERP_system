const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS cliente_cc_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    cliente_id INTEGER,

    cliente_doc TEXT,
    cliente_nombre TEXT,

    tipo TEXT NOT NULL,
    concepto TEXT NOT NULL,

    debe REAL NOT NULL DEFAULT 0,
    haber REAL NOT NULL DEFAULT 0,

    saldo REAL NOT NULL DEFAULT 0,

    factura_id INTEGER,
    documento_id INTEGER,

    observaciones TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (documento_id) REFERENCES documentos_comerciales(id)
  );
`);

console.log("Cuenta corriente de clientes creada");
