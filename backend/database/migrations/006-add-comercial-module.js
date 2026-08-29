const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    comision_porcentaje REAL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  CREATE TABLE IF NOT EXISTS documentos_comerciales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    cliente_id INTEGER,
    vendedor_id INTEGER,

    tipo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'BORRADOR',

    punto_venta INTEGER,
    numero INTEGER,

    fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vencimiento TEXT,

    condicion_venta TEXT,
    observaciones TEXT,

    importe_neto REAL DEFAULT 0,
    importe_iva REAL DEFAULT 0,
    importe_total REAL DEFAULT 0,

    factura_id INTEGER,
    remito_id INTEGER,
    presupuesto_id INTEGER,
    nota_pedido_id INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
  );

  CREATE TABLE IF NOT EXISTS documento_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento_id INTEGER NOT NULL,
    producto_id INTEGER,
    codigo TEXT,
    descripcion TEXT NOT NULL,
    unidad TEXT,
    cantidad REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    descuento REAL DEFAULT 0,
    iva REAL DEFAULT 21,
    subtotal REAL DEFAULT 0,
    iva_importe REAL DEFAULT 0,
    total REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (documento_id) REFERENCES documentos_comerciales(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );
`);

console.log("Módulo comercial creado");
