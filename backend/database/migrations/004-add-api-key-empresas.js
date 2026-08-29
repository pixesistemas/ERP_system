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
  "empresas",
  "api_key",
  "ALTER TABLE empresas ADD COLUMN api_key TEXT",
);
addColumn(
  "empresas",
  "api_key_activa",
  "ALTER TABLE empresas ADD COLUMN api_key_activa INTEGER DEFAULT 1",
);

console.log("Migración API Key finalizada");
