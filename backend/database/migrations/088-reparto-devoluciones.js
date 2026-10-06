const db = require("../../src/db/database");

/*
 * Productos que el cliente devuelve en el momento de la entrega.
 * El repartidor los marca desde su app y el administrador los ve en la
 * ruta y en la trazabilidad del pedido.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS reparto_devoluciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    ruta_id INTEGER NOT NULL,
    ruta_pedido_id INTEGER NOT NULL,
    venta_id INTEGER NOT NULL,
    cliente_id INTEGER,
    producto_id INTEGER,
    codigo TEXT,
    descripcion TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    motivo TEXT,
    fecha TEXT,
    hora TEXT,
    usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("088: tabla reparto_devoluciones creada");
