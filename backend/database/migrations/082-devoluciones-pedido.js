const db = require("../../src/db/database");

/*
 * Devoluciones de productos de pedidos activos (notas de pedido,
 * presupuestos y reservas). Cada devolución guarda su fecha, el motivo,
 * los ítems quitados y el PDF generado.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS devoluciones_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    venta_id INTEGER,
    documento_id INTEGER,
    cliente_id INTEGER,
    cliente_nombre TEXT,
    fecha_devolucion TEXT NOT NULL,
    motivo TEXT,
    total REAL NOT NULL DEFAULT 0,
    pdf_path TEXT,
    pdf_url TEXT,
    usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  CREATE TABLE IF NOT EXISTS devolucion_pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucion_id INTEGER NOT NULL,
    producto_id INTEGER,
    codigo TEXT,
    descripcion TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    precio_unitario REAL NOT NULL DEFAULT 0,
    iva REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (devolucion_id) REFERENCES devoluciones_pedido(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_devoluciones_pedido_empresa
    ON devoluciones_pedido(empresa_id, id DESC);
`);

console.log("082: tablas de devoluciones de pedido creadas");
