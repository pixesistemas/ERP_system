const db = require("../../src/db/database");

/*
 * Configuración del comprobante inicial de ventas: con qué documento
 * arranca una venta (NOTA_PEDIDO / PRESUPUESTO / FACTURA). Se guarda en
 * empresa_configuraciones.tipo_inicial_venta. Cuando el valor es FACTURA
 * no se marca ningún check en la UI (arranca directo en factura).
 */
const columnas = db
  .prepare("PRAGMA table_info(empresa_configuraciones)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("tipo_inicial_venta")) {
  db.exec(
    "ALTER TABLE empresa_configuraciones ADD COLUMN tipo_inicial_venta TEXT NOT NULL DEFAULT 'FACTURA'",
  );
  console.log(
    "empresa_configuraciones: columna tipo_inicial_venta agregada (default FACTURA).",
  );
} else {
  console.log(
    "empresa_configuraciones: tipo_inicial_venta ya existía.",
  );
}