const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(bancos)").all().map((c) => c.name);
if (!cols.includes("titular")) {
  db.exec("ALTER TABLE bancos ADD COLUMN titular TEXT");
  console.log("Columna agregada: bancos.titular");
} else {
  console.log("Columna existente: bancos.titular");
}