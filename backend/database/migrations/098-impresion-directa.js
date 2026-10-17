const db = require("../../src/db/database");

/*
 * Impresión directa por punto de venta.
 *
 * Con la opción activada, al cerrar una venta el POS manda el comprobante
 * directo a la impresora (pensado para Chrome con --kiosk-printing) sin
 * abrir la vista previa en modal. Con formato "Ticket 80 mm" la impresión
 * directa aplica siempre, tenga o no esta opción.
 */

const cols = db.prepare("PRAGMA table_info(puntos_venta)").all().map((c) => c.name);
if (!cols.includes("impresion_directa")) {
  db.exec("ALTER TABLE puntos_venta ADD COLUMN impresion_directa INTEGER NOT NULL DEFAULT 0");
  console.log("098: puntos_venta.impresion_directa agregada");
}

console.log("098: impresión directa por punto de venta lista");
