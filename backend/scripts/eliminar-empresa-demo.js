const db = require("../src/db/database");

/*
 * Elimina la empresa demo (PixeSistemas / empresa1) y sus datos asociados.
 * Pensado para ejecutar UNA VEZ en producción, antes de crear la empresa real
 * desde el panel de superadmin.
 *
 * Uso:
 *   node scripts/eliminar-empresa-demo.js              (solo muestra qué haría)
 *   node scripts/eliminar-empresa-demo.js --confirmar  (elimina de verdad)
 */

const confirmar = process.argv.includes("--confirmar");

const demo = db
  .prepare("SELECT id, nombre FROM empresas WHERE nombre IN ('PixeSistemas','empresa1')")
  .all();

if (!demo.length) {
  console.log("No se encontró ninguna empresa demo (PixeSistemas / empresa1).");
  process.exit(0);
}

console.log("Empresa(s) demo encontradas:");
demo.forEach((e) => console.log(`  id ${e.id} - ${e.nombre}`));

if (!confirmar) {
  console.log(
    "\nEsto ELIMINA la empresa demo y todos sus datos (comprobantes, clientes, productos, usuarios, etc.).",
  );
  console.log("Para confirmar, volvé a ejecutar agregando: --confirmar");
  process.exit(0);
}

const tablas = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name);

function tieneColumna(tabla, col) {
  return db.prepare(`PRAGMA table_info(${tabla})`).all().some((c) => c.name === col);
}
function existeTabla(tabla) {
  return tablas.includes(tabla);
}

db.pragma("foreign_keys = OFF");
const tx = db.transaction(() => {
  for (const e of demo) {
    const eid = e.id;

    // Ítems de comprobantes y de ventas POS (no tienen empresa_id propio).
    const docIds = db
      .prepare("SELECT id FROM documentos_comerciales WHERE empresa_id=?")
      .all(eid)
      .map((r) => r.id);
    if (docIds.length && existeTabla("documento_items")) {
      const ph = docIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM documento_items WHERE documento_id IN (${ph})`).run(...docIds);
    }

    const ventaIds = db
      .prepare("SELECT id FROM ventas_pos WHERE empresa_id=?")
      .all(eid)
      .map((r) => r.id);
    if (ventaIds.length) {
      const ph = ventaIds.map(() => "?").join(",");
      if (existeTabla("venta_pos_items"))
        db.prepare(`DELETE FROM venta_pos_items WHERE venta_id IN (${ph})`).run(...ventaIds);
      if (existeTabla("venta_pos_pagos"))
        db.prepare(`DELETE FROM venta_pos_pagos WHERE venta_id IN (${ph})`).run(...ventaIds);
    }

    // Usuarios vinculados a esta empresa (para borrar los que queden huérfanos).
    const userIds = db
      .prepare("SELECT usuario_id FROM usuario_empresas WHERE empresa_id=?")
      .all(eid)
      .map((r) => r.usuario_id);

    // Borra todas las tablas que tengan empresa_id.
    for (const t of tablas) {
      if (t === "empresas") continue;
      if (tieneColumna(t, "empresa_id")) {
        db.prepare(`DELETE FROM ${t} WHERE empresa_id=?`).run(eid);
      }
    }

    // Usuarios que quedaron sin ninguna empresa: se eliminan junto a sus roles.
    for (const uid of userIds) {
      const otras = db
        .prepare("SELECT COUNT(*) AS c FROM usuario_empresas WHERE usuario_id=?")
        .get(uid).c;
      if (!otras) {
        db.prepare("DELETE FROM usuario_roles WHERE usuario_id=?").run(uid);
        db.prepare("DELETE FROM usuarios WHERE id=?").run(uid);
      }
    }

    db.prepare("DELETE FROM empresas WHERE id=?").run(eid);
    console.log(`Empresa demo id ${eid} (${e.nombre}) eliminada.`);
  }
});
tx();
db.pragma("foreign_keys = ON");

console.log("\nListo. Ahora entrá al panel de superadmin y creá tu empresa real.");