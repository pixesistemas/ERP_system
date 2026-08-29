const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_autorizados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    telefono TEXT NOT NULL,
    nombre TEXT,
    rol TEXT DEFAULT 'OPERADOR',
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    UNIQUE (empresa_id, telefono)
  );
`);

console.log("Tabla whatsapp_autorizados creada");
