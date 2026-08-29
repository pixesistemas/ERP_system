const db = require("../../src/db/database");

function addColumnIfMissing(table, column, sql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    db.exec(sql);
    console.log(`Columna agregada: ${table}.${column}`);
  } else {
    console.log(`Columna existente: ${table}.${column}`);
  }
}

addColumnIfMissing(
  "clientes",
  "empresa_id",
  "ALTER TABLE clientes ADD COLUMN empresa_id INTEGER",
);

addColumnIfMissing(
  "productos",
  "empresa_id",
  "ALTER TABLE productos ADD COLUMN empresa_id INTEGER",
);

db.exec(`
  UPDATE clientes
  SET empresa_id = 1
  WHERE empresa_id IS NULL;

  UPDATE productos
  SET empresa_id = 1
  WHERE empresa_id IS NULL;
`);

console.log("empresa_id agregado a clientes y productos");
