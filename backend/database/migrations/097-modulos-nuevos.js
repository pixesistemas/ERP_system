const db = require("../../src/db/database");

/*
 * Nuevos módulos opcionales: reservas por monto, proveedores + órdenes de
 * pago, cheques y remitos.
 *
 * Se activan por empresa desde el panel de superadmin. Para no cambiarle
 * el funcionamiento a las empresas que ya venían usando estas funciones,
 * esta migración deja el módulo ACTIVO en todas las empresas existentes;
 * las empresas que se creen de acá en adelante los tendrán apagados hasta
 * que el superadmin los active.
 */

const MODULOS = ["RESERVAS_MONTO", "PROVEEDORES", "CHEQUES", "REMITOS"];

const empresas = db.prepare("SELECT id FROM empresas").all();
const ins = db.prepare(
  `INSERT OR IGNORE INTO modulos_empresa(empresa_id,modulo,activo,updated_at)
   VALUES(?,?,1,CURRENT_TIMESTAMP)`,
);
let filas = 0;
for (const e of empresas) {
  for (const modulo of MODULOS) filas += ins.run(e.id, modulo).changes;
}

console.log(`097: módulos nuevos activados en empresas existentes (${filas} filas, ${empresas.length} empresas)`);
