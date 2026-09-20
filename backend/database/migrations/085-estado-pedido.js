const db = require("../../src/db/database");

/*
 * Estado del pedido en el flujo de preventa:
 * PENDIENTE -> REVISANDO -> CONFIRMADO / PARCIAL / RECHAZADO
 *           -> PREPARANDO -> DESPACHADO -> ENTREGADO
 *
 * Se guarda aparte de ventas_pos.estado (PENDIENTE/CONFIRMADA/ANULADO)
 * para no romper la facturación ni los circuitos existentes.
 */

const columnas = db
  .prepare("PRAGMA table_info(ventas_pos)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("estado_pedido")) {
  db.exec(
    "ALTER TABLE ventas_pos ADD COLUMN estado_pedido TEXT NOT NULL DEFAULT 'PENDIENTE'",
  );
  console.log("085: ventas_pos.estado_pedido agregada");
}

console.log("085: estado de pedidos listo");
