const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_config (
    empresa_id INTEGER PRIMARY KEY,
    token TEXT,
    phone_id TEXT,
    numero TEXT,
    verify_token TEXT,
    activo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  )
`);
console.log("Tabla whatsapp_config creada");