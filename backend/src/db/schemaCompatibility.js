const db = require("./database");

/*
 * Mantiene compatible una base creada por versiones anteriores de la demo.
 * Se ejecuta al iniciar y agrega únicamente columnas faltantes.
 */
function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some(
    (column) => String(column.name).toLowerCase() === String(columnName).toLowerCase(),
  );

  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    console.log(`[DB] Columna agregada: ${tableName}.${columnName}`);
  }
}

function ensureSchemaCompatibility() {

  db.exec(`
    CREATE TABLE IF NOT EXISTS caja_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, tipo TEXT NOT NULL, concepto TEXT NOT NULL, importe REAL NOT NULL DEFAULT 0, medios_json TEXT, cliente_nombre TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS empresa_configuraciones (
      empresa_id INTEGER PRIMARY KEY,
      stock_policy TEXT NOT NULL DEFAULT 'WARN',
      stock_alerts_enabled INTEGER NOT NULL DEFAULT 1,
      stock_alert_dashboard INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("empresa_configuraciones", "logo_url", "TEXT");
  ensureColumn("empresa_configuraciones", "recibo_doble_copia", "INTEGER NOT NULL DEFAULT 1");
  const clientTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clientes'").get();
  if (clientTable) ensureColumn("clientes", "descuento_porcentaje", "REAL NOT NULL DEFAULT 0");


  const productTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='productos'").get();
  if (productTable) {
    ensureColumn("productos", "costo", "REAL NOT NULL DEFAULT 0");
    ensureColumn("productos", "utilidad", "REAL NOT NULL DEFAULT 0");
    ensureColumn("productos", "rubro_id", "INTEGER");
    ensureColumn("productos", "subrubro_id", "INTEGER");
    ensureColumn("productos", "marca_id", "INTEGER");
    ensureColumn("productos", "unidad_id", "INTEGER");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS producto_proveedores (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, producto_id INTEGER NOT NULL, proveedor_id INTEGER NOT NULL, codigo_proveedor TEXT, costo REAL NOT NULL DEFAULT 0, principal INTEGER NOT NULL DEFAULT 0, UNIQUE(empresa_id,producto_id,proveedor_id));`);

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("documentos_comerciales");

  if (!table) return;

  ensureColumn("documentos_comerciales", "workspace_id", "INTEGER");
  ensureColumn(
    "documentos_comerciales",
    "condicion_venta",
    "TEXT NOT NULL DEFAULT 'CONTADO'",
  );
  ensureColumn(
    "documentos_comerciales",
    "lista_precio",
    "TEXT NOT NULL DEFAULT 'GENERAL'",
  );
  ensureColumn(
    "documentos_comerciales",
    "descuento_general",
    "REAL NOT NULL DEFAULT 0",
  );
  ensureColumn(
    "documentos_comerciales",
    "descuento_importe",
    "REAL NOT NULL DEFAULT 0",
  );
  ensureColumn(
    "documentos_comerciales",
    "importe_bruto",
    "REAL NOT NULL DEFAULT 0",
  );
  ensureColumn("documentos_comerciales", "fecha_entrega", "TEXT");
  ensureColumn("documentos_comerciales", "fecha_anulacion", "TEXT");
  ensureColumn(
    "documentos_comerciales",
    "canal",
    "TEXT NOT NULL DEFAULT 'API'",
  );
  ensureColumn("documentos_comerciales", "telefono_origen", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documentos_comerciales_workspace
      ON documentos_comerciales (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_documentos_comerciales_telefono
      ON documentos_comerciales (empresa_id, telefono_origen);
  `);
}

module.exports = ensureSchemaCompatibility;
