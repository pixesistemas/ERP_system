const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS recibos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    cliente_id INTEGER,
    cliente_doc TEXT NOT NULL,
    cliente_nombre TEXT NOT NULL,

    punto_venta INTEGER NOT NULL DEFAULT 1,
    numero INTEGER NOT NULL,

    fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    importe_total REAL NOT NULL DEFAULT 0,

    estado TEXT NOT NULL DEFAULT 'BORRADOR',

    observaciones TEXT,
    usuario_id INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    UNIQUE (empresa_id, punto_venta, numero)
  );

  CREATE TABLE IF NOT EXISTS recibo_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    recibo_id INTEGER NOT NULL,

    medio_pago TEXT NOT NULL,
    importe REAL NOT NULL,

    banco TEXT,
    cuenta TEXT,
    alias TEXT,
    cbu TEXT,
    numero_operacion TEXT,

    tarjeta TEXT,
    cuotas INTEGER,
    lote TEXT,
    cupon TEXT,
    autorizacion TEXT,

    cheque_numero TEXT,
    cheque_banco TEXT,
    cheque_fecha_emision TEXT,
    cheque_fecha_cobro TEXT,

    observaciones TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (recibo_id) REFERENCES recibos(id)
  );

  CREATE TABLE IF NOT EXISTS cliente_cc_aplicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    cliente_doc TEXT NOT NULL,

    movimiento_debe_id INTEGER NOT NULL,
    movimiento_haber_id INTEGER NOT NULL,

    importe REAL NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (movimiento_debe_id) REFERENCES cliente_cc_movimientos(id),
    FOREIGN KEY (movimiento_haber_id) REFERENCES cliente_cc_movimientos(id)
  );
`);

console.log("Tesorería: recibos y aplicaciones creados");
