const db = require("../../src/db/database");

/*
 * Pasarelas de pago (MercadoPago / MODO) y links de cobro generados
 * por cliente. El link queda vinculado al documento y se marca como
 * PAGADO cuando el webhook de la pasarela confirma el cobro.
 */
function createTableIfNotExists(name, ddl) {
  const existe = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  if (!existe) {
    db.exec(ddl);
    console.log(`Tabla ${name} creada.`);
  } else {
    console.log(`Tabla ${name} ya existe.`);
  }
}

createTableIfNotExists(
  "pasarelas_pago",
  `CREATE TABLE pasarelas_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    proveedor TEXT NOT NULL,
    nombre TEXT,
    activo INTEGER NOT NULL DEFAULT 0,
    credenciales TEXT,
    config TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
);

createTableIfNotExists(
  "links_pago",
  `CREATE TABLE links_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    cliente_id INTEGER,
    documento_id INTEGER,
    proveedor TEXT NOT NULL,
    importe REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    url TEXT,
    qr_data TEXT,
    external_id TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    vencimiento TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_pago TEXT,
    webhook_raw TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_links_pago_empresa ON links_pago(empresa_id);
   CREATE INDEX IF NOT EXISTS idx_links_pago_documento ON links_pago(documento_id);
   CREATE INDEX IF NOT EXISTS idx_links_pago_estado ON links_pago(estado);
   CREATE INDEX IF NOT EXISTS idx_pasarelas_empresa ON pasarelas_pago(empresa_id, proveedor);`,
);
