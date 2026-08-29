const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(empresa_configuraciones)").all().map((c) => c.name);
if (!cols.includes("auto_eliminar_notax_dias")) {
  db.exec("ALTER TABLE empresa_configuraciones ADD COLUMN auto_eliminar_notax_dias INTEGER NOT NULL DEFAULT 0");
  console.log("Columna agregada: empresa_configuraciones.auto_eliminar_notax_dias");
} else {
  console.log("Columna existente: empresa_configuraciones.auto_eliminar_notax_dias");
}