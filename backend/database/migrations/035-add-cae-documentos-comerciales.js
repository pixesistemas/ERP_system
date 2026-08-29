const db = require("../../src/db/database");

/*
 * Migración 035
 *
 * Agrega a documentos_comerciales los datos de autorización
 * fiscal (CAE) que devuelve AFIP/ARCA al emitir una factura
 * electrónica desde el cierre del POS.
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

addColumn(
  "documentos_comerciales",
  "cae",
  "ALTER TABLE documentos_comerciales ADD COLUMN cae TEXT",
);

addColumn(
  "documentos_comerciales",
  "cae_vencimiento",
  "ALTER TABLE documentos_comerciales ADD COLUMN cae_vencimiento TEXT",
);

addColumn(
  "documentos_comerciales",
  "comprobante_tipo_afip",
  "ALTER TABLE documentos_comerciales ADD COLUMN comprobante_tipo_afip INTEGER",
);

addColumn(
  "documentos_comerciales",
  "comprobante_letra",
  "ALTER TABLE documentos_comerciales ADD COLUMN comprobante_letra TEXT",
);

addColumn(
  "documentos_comerciales",
  "afip_resultado",
  "ALTER TABLE documentos_comerciales ADD COLUMN afip_resultado TEXT",
);

addColumn(
  "documentos_comerciales",
  "afip_observaciones",
  "ALTER TABLE documentos_comerciales ADD COLUMN afip_observaciones TEXT",
);

console.log("CAE agregado a documentos comerciales");
