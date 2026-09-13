const db = require("../db/database");

/*
 * Persistencia de errores de la API. Se usa desde el manejador global de
 * errores (app.js) y desde el panel de superadmin para consultarlos.
 *
 * Nunca lanza: si el registro falla, no debe afectar la respuesta al cliente.
 */

const MAX_FILAS = 5000;

function registrarError({ metodo, ruta, status, codigo, mensaje, stack, usuarioId, empresaId, ip }) {
  try {
    db.prepare(
      `INSERT INTO error_logs(metodo,ruta,status,codigo,mensaje,stack,usuario_id,empresa_id,ip)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
      metodo || null,
      ruta || null,
      Number(status) || 500,
      codigo || null,
      String(mensaje || "").slice(0, 2000),
      String(stack || "").slice(0, 8000),
      usuarioId ? Number(usuarioId) : null,
      empresaId ? Number(empresaId) : null,
      ip || null,
    );
    const total = db.prepare("SELECT COUNT(*) n FROM error_logs").get().n;
    if (total > MAX_FILAS) {
      db.prepare(
        "DELETE FROM error_logs WHERE id IN (SELECT id FROM error_logs ORDER BY id ASC LIMIT ?)",
      ).run(total - MAX_FILAS);
    }
  } catch (e) {
    console.error("[error-log] No se pudo registrar el error:", e.message);
  }
}

function listarErrores({ limite = 200, empresaId = null } = {}) {
  const lim = Math.max(1, Math.min(1000, Number(limite) || 200));
  if (empresaId) {
    return db
      .prepare(
        `SELECT e.*, em.nombre empresa_nombre, u.nombre usuario_nombre
         FROM error_logs e
         LEFT JOIN empresas em ON em.id=e.empresa_id
         LEFT JOIN usuarios u ON u.id=e.usuario_id
         WHERE e.empresa_id=?
         ORDER BY e.id DESC LIMIT ?`,
      )
      .all(Number(empresaId), lim);
  }
  return db
    .prepare(
      `SELECT e.*, em.nombre empresa_nombre, u.nombre usuario_nombre
       FROM error_logs e
       LEFT JOIN empresas em ON em.id=e.empresa_id
       LEFT JOIN usuarios u ON u.id=e.usuario_id
       ORDER BY e.id DESC LIMIT ?`,
    )
    .all(lim);
}

function limpiarErrores({ empresaId = null } = {}) {
  if (empresaId) {
    return db.prepare("DELETE FROM error_logs WHERE empresa_id=?").run(Number(empresaId)).changes;
  }
  return db.prepare("DELETE FROM error_logs").run().changes;
}

module.exports = { registrarError, listarErrores, limpiarErrores };
