const db = require("../../src/db/database");

/*
 * Migración 037
 *
 * whatsapp_clientes: números de teléfono que escribieron pidiendo comprar
 * por WhatsApp. Es independiente de whatsapp_autorizados (que es la lista
 * de operadores internos). Un número nuevo entra en estado PENDIENTE hasta
 * que un administrador lo aprueba (y lo vincula a un cliente existente o
 * a uno nuevo).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    telefono TEXT NOT NULL,
    cliente_id INTEGER,
    nombre_declarado TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resuelto_at TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    UNIQUE (empresa_id, telefono)
  );
`);

console.log("Tabla whatsapp_clientes creada");
