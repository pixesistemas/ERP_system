const db = require("../../src/db/database");

/*
 * Artículo manual en ventas.
 *
 * Agrega la configuración por empresa que permite usar el "artículo o
 * servicio manual" (descripción y código libres) no solo en presupuestos
 * sino también en las ventas del POS. El código vacío se guarda como MANUAL.
 */

const columnas = db
  .prepare("PRAGMA table_info(empresa_configuraciones)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("manual_en_venta")) {
  db.exec(
    "ALTER TABLE empresa_configuraciones ADD COLUMN manual_en_venta INTEGER NOT NULL DEFAULT 0",
  );
  console.log("090: empresa_configuraciones.manual_en_venta agregada");
}

console.log("090: artículo manual en ventas listo");
