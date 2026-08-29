const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS documento_relaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,

    documento_origen_id INTEGER NOT NULL,
    documento_destino_id INTEGER NOT NULL,

    tipo TEXT NOT NULL,

    observaciones TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (documento_origen_id) REFERENCES documentos_comerciales(id),
    FOREIGN KEY (documento_destino_id) REFERENCES documentos_comerciales(id),

    UNIQUE (empresa_id, documento_origen_id, documento_destino_id, tipo)
  );
`);

console.log("Tabla documento_relaciones creada");
