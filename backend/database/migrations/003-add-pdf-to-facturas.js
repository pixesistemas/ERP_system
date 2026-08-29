const db = require("../../src/db/database");

function addColumn(table, name, sql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((c) => c.name === name);

  if (!exists) {
    db.exec(sql);
    console.log(`Columna agregada: ${table}.${name}`);
  } else {
    console.log(`Columna ya existe: ${table}.${name}`);
  }
}

addColumn(
  "facturas",
  "pdf_path",
  "ALTER TABLE facturas ADD COLUMN pdf_path TEXT",
);
addColumn(
  "facturas",
  "pdf_url",
  "ALTER TABLE facturas ADD COLUMN pdf_url TEXT",
);

console.log("Migración PDF finalizada");
