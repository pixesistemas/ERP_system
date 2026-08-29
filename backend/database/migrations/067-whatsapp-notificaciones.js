const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    telefono TEXT NOT NULL,
    pedido_id INTEGER,
    estado_pedido TEXT,
    mensaje TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("Tabla whatsapp_notificaciones creada");