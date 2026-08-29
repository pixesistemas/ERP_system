const db = require("../../src/db/database");

/*
 * Migración 038
 *
 * Etapa fiscal: registro de intentos de autorización de comprobantes
 * (CAE) y estado fiscal de los documentos comerciales.
 *
 * - fiscal_intentos: historial de cada llamada a WSFE (autorizado,
 *   pendiente, rechazado o error de red) con número, CAE y detalle.
 * - documentos_comerciales.afip_estado: estado fiscal del documento
 *   (SIN_CAE, PENDIENTE, AUTORIZADO, RECHAZADO) para poder reintentar
 *   cuando ARCA no responde sin perder la operación.
 */

function addColumn(table, column, sql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    db.exec(sql);
    console.log(`Columna agregada: ${table}.${column}`);
  } else {
    console.log(`Columna existente: ${table}.${column}`);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS fiscal_intentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  venta_id INTEGER,
  documento_id INTEGER,
  operacion TEXT NOT NULL DEFAULT 'FACTURA',
  estado TEXT NOT NULL,
  intento INTEGER NOT NULL DEFAULT 1,
  tipo_comprobante INTEGER,
  letra TEXT,
  numero INTEGER,
  cae TEXT,
  cae_vencimiento TEXT,
  error TEXT,
  respuesta_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fiscal_intentos_documento
  ON fiscal_intentos(documento_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_intentos_empresa
  ON fiscal_intentos(empresa_id, estado);
`);

addColumn(
  "documentos_comerciales",
  "afip_estado",
  "ALTER TABLE documentos_comerciales ADD COLUMN afip_estado TEXT NOT NULL DEFAULT 'SIN_CAE'",
);

console.log("038 etapa fiscal: intentos de CAE y estado fiscal aplicados");
