const db = require("../../src/db/database");

/*
 * Cobros pendientes declarados en el pedido.
 *
 * El vendedor (o el repartidor al entregar) puede registrar que el cliente
 * entrega dinero a cuenta (efectivo, transferencia o cheque, con foto).
 * Ese dinero queda PENDIENTE hasta que el administrador lo confirma:
 * ahí recién se genera el recibo y el movimiento de cuenta corriente.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS pedido_cobros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    venta_id INTEGER NOT NULL,
    cliente_id INTEGER,
    vendedor_id INTEGER,
    usuario_id INTEGER,
    origen TEXT NOT NULL DEFAULT 'VENDEDOR' CHECK (origen IN ('VENDEDOR','REPARTIDOR')),
    medio TEXT NOT NULL CHECK (medio IN ('EFECTIVO','TRANSFERENCIA','CHEQUE')),
    importe REAL NOT NULL DEFAULT 0,
    banco TEXT,
    cheque_numero TEXT,
    cheque_librador TEXT,
    cheque_vencimiento TEXT,
    foto_path TEXT,
    observaciones TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','CONFIRMADO','RECHAZADO')),
    recibo_id INTEGER,
    confirmado_por INTEGER,
    confirmado_en TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_pedido_cobros_empresa ON pedido_cobros (empresa_id, venta_id);
  CREATE INDEX IF NOT EXISTS idx_pedido_cobros_estado ON pedido_cobros (empresa_id, estado);
`);

console.log("094: cobros pendientes de pedidos listos");
