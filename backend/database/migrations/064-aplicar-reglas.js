const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(empresa_configuraciones)").all().map((c) => c.name);
if (!cols.includes("aplicar_reglas_en")) {
  db.exec("ALTER TABLE empresa_configuraciones ADD COLUMN aplicar_reglas_en TEXT");
  console.log("Columna agregada: empresa_configuraciones.aplicar_reglas_en");
} else {
  console.log("Columna existente: empresa_configuraciones.aplicar_reglas_en");
}