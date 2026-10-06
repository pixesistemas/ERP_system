const db = require("../../src/db/database");

/*
 * Confirmación de las devoluciones de reparto por parte del administrador.
 * Solo las confirmadas descuentan en los reportes y quedan como definitivas.
 */

function columnas(tabla) {
  return db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .map((c) => c.name);
}

const actuales = columnas("reparto_devoluciones");

if (!actuales.includes("confirmado")) {
  db.exec(
    "ALTER TABLE reparto_devoluciones ADD COLUMN confirmado INTEGER NOT NULL DEFAULT 0",
  );
  console.log("089: reparto_devoluciones.confirmado agregada");
}
if (!actuales.includes("confirmado_por")) {
  db.exec("ALTER TABLE reparto_devoluciones ADD COLUMN confirmado_por INTEGER");
}
if (!actuales.includes("confirmado_en")) {
  db.exec("ALTER TABLE reparto_devoluciones ADD COLUMN confirmado_en TEXT");
}

console.log("089: confirmación de devoluciones lista");
