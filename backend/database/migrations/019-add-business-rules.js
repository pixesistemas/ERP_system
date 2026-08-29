const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS business_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,

    evento TEXT NOT NULL,
    condicion TEXT NOT NULL,
    accion TEXT NOT NULL,

    activa INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );
`);

console.log("Business Rules creado");
