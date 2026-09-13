const db = require("../db/database");
const notificacion = require("../services/notificacion.service");

/*
 * Persistencia de errores de la API. Se usa desde el manejador global de
 * errores (app.js) y desde el panel de superadmin para consultarlos.
 *
 * Nunca lanza: si el registro falla, no debe afectar la respuesta al cliente.
 */

const MAX_FILAS = 5000;
const ALERTA_COOLDOWN_SEG = Number(process.env.ERROR_ALERTA_COOLDOWN_SEG || 600);

function puedeAlertar(signature) {
  const row = db
    .prepare(
      "SELECT veces,(strftime('%s','now') - strftime('%s',enviada_en)) seg FROM error_alertas WHERE signature=?",
    )
    .get(signature);
  if (!row) {
    db.prepare("INSERT INTO error_alertas(signature) VALUES(?)").run(signature);
    return true;
  }
  if (row.seg != null && row.seg < ALERTA_COOLDOWN_SEG) {
    db.prepare("UPDATE error_alertas SET veces=veces+1 WHERE signature=?").run(signature);
    return false;
  }
  db.prepare("UPDATE error_alertas SET enviada_en=CURRENT_TIMESTAMP,veces=veces+1 WHERE signature=?").run(signature);
  return true;
}

function alertarSuperadmin({ metodo, ruta, status, codigo, mensaje, stack }) {
  const signature = `${metodo} ${ruta} ${status} ${codigo || ""}`;
  if (!puedeAlertar(signature)) return;
  const texto =
    `⚠️ Error del sistema\n` +
    `${metodo} ${ruta}\n` +
    `Estado: ${status}${codigo ? ` (${codigo})` : ""}\n` +
    `Detalle: ${String(mensaje || "").slice(0, 400)}`;
  notificacion.enviarWhatsappSuperadmin({ mensaje: texto }).catch(() => {});
}

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
    if (Number(status) >= 500) {
      alertarSuperadmin({ metodo, ruta, status, codigo, mensaje, stack });
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
