const db = require("../../src/db/database");

/*
 * Datos de la visita del vendedor en el pedido tomado desde la app móvil:
 * ubicación GPS, fecha/hora de visita y dispositivo. Quedan en la venta
 * para poder mostrarlos en la bandeja del administrador y en los reportes.
 */

function columnas(tabla) {
  return db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .map((c) => c.name);
}

function agregarColumna(tabla, columna, definicion) {
  if (!columnas(tabla).includes(columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    console.log(`084: ${tabla}.${columna} agregada`);
  }
}

agregarColumna("ventas_pos", "latitud", "REAL");
agregarColumna("ventas_pos", "longitud", "REAL");
agregarColumna("ventas_pos", "fecha_visita", "TEXT");
agregarColumna("ventas_pos", "hora_visita", "TEXT");
agregarColumna("ventas_pos", "dispositivo", "TEXT");

console.log("084: ubicación de pedidos móviles lista");
