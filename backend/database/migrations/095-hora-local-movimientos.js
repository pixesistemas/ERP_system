const db = require("../../src/db/database");

/*
 * Hora local en movimientos de cuenta corriente, recibos, caja y cheques.
 *
 * Estas tablas usaban el DEFAULT CURRENT_TIMESTAMP de SQLite, que guarda
 * UTC: por eso se veían 3 horas corridas. La migración:
 *  1) corrige hacia atrás las filas existentes (todas estaban en UTC),
 *  2) crea un trigger por tabla que, en cada INSERT, reescribe created_at
 *     con la hora local del servidor (TZ de la empresa).
 */

const TABLAS = ["cliente_cc_movimientos", "recibos", "caja_movimientos", "cheques"];

for (const tabla of TABLAS) {
  const existe = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tabla);
  if (!existe) continue;

  const filas = db
    .prepare(`SELECT COUNT(1) n FROM ${tabla} WHERE created_at IS NOT NULL`)
    .get().n;
  if (filas > 0) {
    db.exec(`UPDATE ${tabla} SET created_at = datetime(created_at, '-3 hours')`);
    console.log(`095: ${tabla} ajustada a hora local (${filas} filas)`);
  }
  db.exec(
    `CREATE TRIGGER IF NOT EXISTS trg_${tabla}_hora_local
     AFTER INSERT ON ${tabla}
     BEGIN
       UPDATE ${tabla} SET created_at = datetime('now','localtime') WHERE id = NEW.id;
     END`,
  );
}

console.log("095: hora local lista en cuenta corriente, recibos, caja y cheques");
