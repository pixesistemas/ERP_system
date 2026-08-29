const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS event_store (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER,
    evento TEXT NOT NULL,

    entidad TEXT,
    entidad_id TEXT,

    usuario_id INTEGER,
    origen TEXT,

    payload TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("Event Store creado");
