const db = require("./database");
const { PANTALLAS } = require("../constants/pantallas");
const { sincronizarPermisosRol } = require("../repositories/rol.repository");

/*
 * Registra las pantallas nuevas y las suma automáticamente a los roles que
 * ya tienen una lista explícita de pantallas.
 *
 * Regla: una pantalla registrada DESPUÉS de `roles.pantallas_actualizado_en`
 * es "nueva" para ese rol y se agrega. Las pantallas que ya existían cuando
 * el rol se guardó NO se re-agregan, así se respeta lo que el administrador
 * haya desmarcado a propósito.
 *
 * Se ejecuta al iniciar el servidor (bootstrap), después de las migraciones.
 */
function reconciliarPantallas() {
  const registrar = db.prepare(
    "INSERT OR IGNORE INTO pantallas_registro(pantalla, created_at) VALUES(?, CURRENT_TIMESTAMP)",
  );
  for (const pantalla of PANTALLAS) registrar.run(pantalla);

  const roles = db
    .prepare("SELECT id, pantallas_actualizado_en FROM roles")
    .all();

  let totalAgregadas = 0;
  const rolesAfectados = new Set();

  for (const rol of roles) {
    const tieneLista =
      db
        .prepare("SELECT COUNT(*) AS c FROM rol_pantallas WHERE rol_id = ?")
        .get(rol.id).c > 0;

    // Si no tiene lista, el rol ve todas las pantallas: no hay nada que sumar.
    if (!tieneLista) continue;

    const referencia = rol.pantallas_actualizado_en || "2000-01-01 00:00:00";
    const nuevas = db
      .prepare(
        "SELECT pantalla FROM pantallas_registro WHERE created_at > ?",
      )
      .all(referencia);

    if (!nuevas.length) continue;

    const insertar = db.prepare(
      "INSERT OR IGNORE INTO rol_pantallas(rol_id, pantalla) VALUES(?, ?)",
    );
    for (const n of nuevas) {
      const res = insertar.run(rol.id, n.pantalla);
      if (res.changes) {
        totalAgregadas++;
        rolesAfectados.add(rol.id);
      }
    }
  }

  // Re-sincroniza los permisos derivados de las pantallas para los roles
  // que recibieron pantallas nuevas.
  for (const rolId of rolesAfectados) {
    try {
      sincronizarPermisosRol(rolId);
    } catch (e) {
      // no interrumpe el arranque
    }
  }

  return { pantallasRegistradas: PANTALLAS.length, pantallasAgregadas: totalAgregadas };
}

module.exports = { reconciliarPantallas };