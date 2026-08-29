const db = require("../../src/db/database");

/*
 * Separa las cajas por punto de venta: cada apertura queda asociada al PV
 * donde se facturó, para que Caja y Cierres de caja puedan filtrarse por
 * punto de venta igual que el resto de los módulos (empresa → sucursal →
 * puntos de venta).
 */
const colsCaja = db
  .prepare("PRAGMA table_info(caja_sesiones)")
  .all()
  .map((c) => c.name);

if (!colsCaja.includes("punto_venta")) {
  db.exec("ALTER TABLE caja_sesiones ADD COLUMN punto_venta INTEGER");
  console.log("Caja: columna punto_venta agregada");
}

db.exec(`
  UPDATE caja_sesiones
  SET punto_venta = (
    SELECT v.punto_venta
    FROM ventas_pos v
    WHERE v.caja_sesion_id = caja_sesiones.id
    ORDER BY v.id
    LIMIT 1
  )
  WHERE punto_venta IS NULL
`);
