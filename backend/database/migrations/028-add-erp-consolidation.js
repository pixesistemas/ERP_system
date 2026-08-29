const db = require('../../src/db/database');

/* Consolida catálogos operativos que antes estaban repartidos entre SQLite y almacenamiento del navegador. */
db.exec(`
CREATE TABLE IF NOT EXISTS bancos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  cuenta TEXT,
  cbu TEXT,
  alias TEXT,
  saldo_inicial REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS puntos_venta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  sucursal_id INTEGER,
  numero INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  fiscal INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (empresa_id, numero),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  banco_origen TEXT,
  librador TEXT,
  importe REAL NOT NULL,
  fecha_emision TEXT,
  fecha_vencimiento TEXT,
  estado TEXT NOT NULL DEFAULT 'EN_CARTERA',
  cliente_id INTEGER,
  proveedor_id INTEGER,
  comprobante_tipo TEXT,
  comprobante_id INTEGER,
  banco_destino_id INTEGER,
  fecha_deposito TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (banco_destino_id) REFERENCES bancos(id)
);

CREATE TABLE IF NOT EXISTS cheque_depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  banco_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE_CONCILIACION',
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (banco_id) REFERENCES bancos(id)
);

CREATE TABLE IF NOT EXISTS cheque_deposito_items (
  deposito_id INTEGER NOT NULL,
  cheque_id INTEGER NOT NULL,
  importe REAL NOT NULL,
  PRIMARY KEY (deposito_id, cheque_id),
  FOREIGN KEY (deposito_id) REFERENCES cheque_depositos(id) ON DELETE CASCADE,
  FOREIGN KEY (cheque_id) REFERENCES cheques(id)
);

CREATE TABLE IF NOT EXISTS empresa_archivos_fiscales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('CERTIFICADO','LLAVE_PRIVADA')),
  nombre_original TEXT NOT NULL,
  ruta_segura TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (empresa_id, tipo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
`);

const cols = db.prepare("PRAGMA table_info(whatsapp_autorizados)").all().map(c => c.name);
for (const [name, sql] of [
  ['puede_consultar', 'ALTER TABLE whatsapp_autorizados ADD COLUMN puede_consultar INTEGER NOT NULL DEFAULT 1'],
  ['puede_presupuestar', 'ALTER TABLE whatsapp_autorizados ADD COLUMN puede_presupuestar INTEGER NOT NULL DEFAULT 1'],
  ['puede_facturar', 'ALTER TABLE whatsapp_autorizados ADD COLUMN puede_facturar INTEGER NOT NULL DEFAULT 0'],
  ['ultima_interaccion', 'ALTER TABLE whatsapp_autorizados ADD COLUMN ultima_interaccion TEXT']
]) {
  if (!cols.includes(name)) db.exec(sql);
}

console.log('Consolidación ERP 028 aplicada');
