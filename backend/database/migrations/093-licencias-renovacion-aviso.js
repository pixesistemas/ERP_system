const db = require("../../src/db/database");

/*
 * Licencias: renovación automática y control de avisos por vencimiento.
 */

const columnas = db
  .prepare("PRAGMA table_info(licencias)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("renovacion_automatica")) {
  db.exec("ALTER TABLE licencias ADD COLUMN renovacion_automatica INTEGER NOT NULL DEFAULT 0");
  console.log("093: licencias.renovacion_automatica agregada");
}
if (!columnas.includes("aviso_vencimiento_en")) {
  db.exec("ALTER TABLE licencias ADD COLUMN aviso_vencimiento_en TEXT");
  console.log("093: licencias.aviso_vencimiento_en agregada");
}

console.log("093: licencias con renovación y avisos lista");
