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
  "documentos_comerciales",
  "pdf_path",
  "ALTER TABLE documentos_comerciales ADD COLUMN pdf_path TEXT",
);

addColumn(
  "documentos_comerciales",
  "pdf_url",
  "ALTER TABLE documentos_comerciales ADD COLUMN pdf_url TEXT",
);

console.log("PDF agregado a documentos comerciales");
