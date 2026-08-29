const db = require("../../src/db/database");

/*
 * Config por tipo de comprobante: pie de página pegado al detalle o al pie
 * de la hoja. Se suma a config_comprobantes para que cada comprobante
 * (factura, nota de venta, presupuesto, nota de pedido, remito, etc.)
 * tenga su propia opción, en vez de la única global del diseñador.
 */
const columnas = db
  .prepare("PRAGMA table_info(config_comprobantes)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("pie_pegado")) {
  db.exec(
    "ALTER TABLE config_comprobantes ADD COLUMN pie_pegado INTEGER NOT NULL DEFAULT 1",
  );
  console.log("Config Comprobantes: columna pie_pegado agregada (default 1).");
} else {
  console.log("Config Comprobantes: pie_pegado ya existía.");
}
