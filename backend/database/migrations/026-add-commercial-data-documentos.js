const db = require("../../src/db/database");

/*
 * Migración 026
 *
 * Agrega a documentos_comerciales los datos
 * comerciales provenientes del Workspace.
 */

/*
 * Obtiene las columnas actuales de la tabla.
 */
const columns = db
  .prepare(
    `
    PRAGMA table_info(documentos_comerciales)
    `,
  )
  .all();

const existingColumns = new Set(
  columns.map((column) => String(column.name).toLowerCase()),
);

/*
 * Agrega una columna solo cuando todavía no existe.
 */
function addColumnIfMissing(columnName, definition) {
  const normalizedName = String(columnName).toLowerCase();

  if (existingColumns.has(normalizedName)) {
    console.log(`La columna documentos_comerciales.${columnName} ya existe`);

    return;
  }

  db.exec(`
    ALTER TABLE documentos_comerciales
    ADD COLUMN ${columnName} ${definition}
  `);

  existingColumns.add(normalizedName);

  console.log(`Columna agregada: documentos_comerciales.${columnName}`);
}

/*
 * Vincula el documento comercial
 * con el workspace que lo originó.
 */
addColumnIfMissing("workspace_id", "INTEGER");

/*
 * Guarda CONTADO o CUENTA_CORRIENTE.
 */
addColumnIfMissing("condicion_venta", "TEXT NOT NULL DEFAULT 'CONTADO'");

/*
 * Guarda la lista de precios aplicada.
 */
addColumnIfMissing("lista_precio", "TEXT NOT NULL DEFAULT 'GENERAL'");

/*
 * Guarda el porcentaje de descuento general.
 */
addColumnIfMissing("descuento_general", "REAL NOT NULL DEFAULT 0");

/*
 * Guarda el importe monetario descontado.
 */
addColumnIfMissing("descuento_importe", "REAL NOT NULL DEFAULT 0");

/*
 * Guarda el total antes del descuento general.
 */
addColumnIfMissing("importe_bruto", "REAL NOT NULL DEFAULT 0");

/*
 * Guarda la fecha de entrega solicitada.
 */
addColumnIfMissing("fecha_entrega", "TEXT");

/*
 * Guarda el canal de origen.
 *
 * Ejemplos:
 * API, WHATSAPP, WEB, N8N.
 */
addColumnIfMissing("canal", "TEXT NOT NULL DEFAULT 'API'");

/*
 * Guarda el teléfono que inició
 * la operación comercial.
 */
addColumnIfMissing("telefono_origen", "TEXT");

/*
 * Crea índices para búsquedas por workspace
 * y teléfono de origen.
 */
db.exec(`
  CREATE INDEX IF NOT EXISTS
    idx_documentos_comerciales_workspace
  ON documentos_comerciales (
    workspace_id
  );

  CREATE INDEX IF NOT EXISTS
    idx_documentos_comerciales_telefono
  ON documentos_comerciales (
    empresa_id,
    telefono_origen
  );
`);

console.log("Documentos comerciales: datos de Workspace agregados");
