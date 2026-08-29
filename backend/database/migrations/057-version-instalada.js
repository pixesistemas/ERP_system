const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(empresas)").all().map((c) => c.name);
if (!cols.includes("version_instalada")) {
  db.exec("ALTER TABLE empresas ADD COLUMN version_instalada TEXT");
  console.log("Columna agregada: empresas.version_instalada");
} else {
  console.log("Columna existente: empresas.version_instalada");
}