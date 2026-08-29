const db = require('../../src/db/database');

db.exec(`
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  concepto TEXT NOT NULL,
  importe REAL NOT NULL DEFAULT 0,
  medios_json TEXT,
  cliente_nombre TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS sucursales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  domicilio TEXT,
  deposito_id INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,codigo),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(deposito_id) REFERENCES depositos(id)
);

CREATE TABLE IF NOT EXISTS cajeros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  usuario_id INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,codigo),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS caja_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  sucursal_id INTEGER,
  cajero_id INTEGER,
  usuario_id INTEGER,
  fecha_apertura TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TEXT,
  importe_apertura REAL NOT NULL DEFAULT 0,
  saldo_teorico REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(sucursal_id) REFERENCES sucursales(id),
  FOREIGN KEY(cajero_id) REFERENCES cajeros(id),
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS ventas_pos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  sucursal_id INTEGER,
  cajero_id INTEGER,
  caja_sesion_id INTEGER,
  cliente_id INTEGER,
  vendedor_id INTEGER,
  punto_venta INTEGER NOT NULL,
  numero INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'CONFIRMADA',
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  condicion_pago TEXT,
  observaciones TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  descuento_general REAL NOT NULL DEFAULT 0,
  recargo_general REAL NOT NULL DEFAULT 0,
  descuento_promociones REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  vuelto REAL NOT NULL DEFAULT 0,
  documento_id INTEGER,
  reserva_monto_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,punto_venta,tipo,numero),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(sucursal_id) REFERENCES sucursales(id),
  FOREIGN KEY(cajero_id) REFERENCES cajeros(id),
  FOREIGN KEY(caja_sesion_id) REFERENCES caja_sesiones(id),
  FOREIGN KEY(cliente_id) REFERENCES clientes(id),
  FOREIGN KEY(vendedor_id) REFERENCES vendedores(id),
  FOREIGN KEY(documento_id) REFERENCES documentos_comerciales(id),
  FOREIGN KEY(reserva_monto_id) REFERENCES reservas_monto(id)
);

CREATE TABLE IF NOT EXISTS venta_pos_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  producto_id INTEGER,
  codigo TEXT,
  descripcion TEXT NOT NULL,
  unidad TEXT,
  cantidad REAL NOT NULL,
  precio_unitario REAL NOT NULL,
  descuento REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 21,
  costo_unitario REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL,
  promocion INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(venta_id) REFERENCES ventas_pos(id) ON DELETE CASCADE,
  FOREIGN KEY(producto_id) REFERENCES productos(id)
);

CREATE TABLE IF NOT EXISTS venta_pos_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  medio TEXT NOT NULL,
  importe REAL NOT NULL,
  detalle_json TEXT,
  FOREIGN KEY(venta_id) REFERENCES ventas_pos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pos_numeradores (
  empresa_id INTEGER NOT NULL,
  punto_venta INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(empresa_id,punto_venta,tipo),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
`);

const cajaCols = db.prepare("PRAGMA table_info(caja_movimientos)").all().map(c=>c.name);
for (const [name, sql] of [
  ['caja_sesion_id', 'ALTER TABLE caja_movimientos ADD COLUMN caja_sesion_id INTEGER'],
  ['sucursal_id', 'ALTER TABLE caja_movimientos ADD COLUMN sucursal_id INTEGER'],
  ['cajero_id', 'ALTER TABLE caja_movimientos ADD COLUMN cajero_id INTEGER'],
  ['venta_id', 'ALTER TABLE caja_movimientos ADD COLUMN venta_id INTEGER']
]) if (!cajaCols.includes(name)) db.exec(sql);

console.log('Núcleo POS 030 aplicado');
