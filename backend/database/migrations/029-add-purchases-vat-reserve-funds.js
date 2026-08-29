const db = require('../../src/db/database');

db.exec(`
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  proveedor_nombre TEXT NOT NULL,
  proveedor_documento TEXT,
  proveedor_domicilio TEXT,
  proveedor_condicion_iva TEXT,
  tipo_documento TEXT DEFAULT 'CUIT',
  mes_iva INTEGER NOT NULL,
  anio_iva INTEGER NOT NULL,
  tipo_comprobante TEXT NOT NULL,
  letra TEXT,
  punto_venta INTEGER NOT NULL,
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  fecha_vencimiento TEXT,
  concepto TEXT DEFAULT 'PRODUCTOS',
  moneda TEXT DEFAULT 'PES',
  cotizacion REAL NOT NULL DEFAULT 1,
  condicion_pago TEXT DEFAULT 'CONTADO',
  rubro_gasto TEXT,
  observaciones TEXT,
  afecta_caja INTEGER NOT NULL DEFAULT 0,
  neto_gravado REAL NOT NULL DEFAULT 0,
  exento_no_gravado REAL NOT NULL DEFAULT 0,
  iva_total REAL NOT NULL DEFAULT 0,
  percepciones_retenciones REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'REGISTRADA',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  UNIQUE (empresa_id, tipo_comprobante, punto_venta, numero)
);

CREATE TABLE IF NOT EXISTS compra_iva_detalles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  alicuota REAL NOT NULL,
  neto REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  total_con_iva REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS compra_retenciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT,
  importe REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservas_monto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  importe_original REAL NOT NULL,
  saldo REAL NOT NULL,
  lista_precio_id INTEGER,
  lista_precio_nombre TEXT,
  precios_snapshot TEXT NOT NULL DEFAULT '{}',
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'VIGENTE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS reserva_monto_consumos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserva_id INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  documento_tipo TEXT,
  documento_id INTEGER,
  importe REAL NOT NULL,
  detalle TEXT,
  FOREIGN KEY (reserva_id) REFERENCES reservas_monto(id) ON DELETE CASCADE
);
`);
console.log('Compras, Libro IVA y reservas por monto 029 aplicados');
