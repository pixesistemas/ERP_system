const db = require("../../src/db/database");

function addColumn(name, sql) {
  const columns = db.prepare("PRAGMA table_info(facturas)").all();
  const exists = columns.some((c) => c.name === name);

  if (!exists) {
    db.exec(sql);
    console.log(`Columna agregada: ${name}`);
  } else {
    console.log(`Columna ya existe: ${name}`);
  }
}

addColumn("letra", "ALTER TABLE facturas ADD COLUMN letra TEXT");
addColumn(
  "comprobante_nombre",
  "ALTER TABLE facturas ADD COLUMN comprobante_nombre TEXT",
);
