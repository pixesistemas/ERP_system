const db = require("../../src/db/database");

/*
 * Almacena el formato de impresión elegido en la configuración de
 * comprobantes (A4 / 80MM / según punto de venta) sobre la venta
 * registrada, para que al reimprimir desde Historial de ventas se
 * use el mismo formato con que se emitió.
 */
const cols = db
  .prepare("PRAGMA table_info(ventas_pos)")
  .all()
  .map((c) => c.name);

if (!cols.includes("formato_impresion")) {
  db.exec(
    `ALTER TABLE ventas_pos ADD COLUMN formato_impresion TEXT NOT NULL DEFAULT 'A4'`,
  );
  console.log("Formato impresión ventas: columna formato_impresion agregada");
}