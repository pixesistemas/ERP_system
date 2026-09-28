const db = require("../../src/db/database");

/*
 * Compras pendientes de revisión que llegan por WhatsApp (foto de la
 * factura de un número autorizado). El OCR lee los datos y el
 * administrador los revisa en Compras antes de confirmarlos.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS compras_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    telefono TEXT,
    remitente TEXT,
    imagen_path TEXT,
    imagen_url TEXT,
    datos_json TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    compra_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("087: tabla compras_pendientes creada");
