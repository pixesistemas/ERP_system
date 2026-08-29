const db = require("../../src/db/database");

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
  "facturas",
  "documento_origen_id",
  "ALTER TABLE facturas ADD COLUMN documento_origen_id INTEGER",
);

addColumn(
  "facturas",
  "documento_origen_tipo",
  "ALTER TABLE facturas ADD COLUMN documento_origen_tipo TEXT",
);

addColumn(
  "facturas",
  "documento_origen_punto_venta",
  "ALTER TABLE facturas ADD COLUMN documento_origen_punto_venta INTEGER",
);

addColumn(
  "facturas",
  "documento_origen_numero",
  "ALTER TABLE facturas ADD COLUMN documento_origen_numero INTEGER",
);

console.log("Origen comercial agregado a facturas");
