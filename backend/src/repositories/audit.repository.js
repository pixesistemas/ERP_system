const db = require("../db/database");

function saveAuditLog({
  evento,
  entidad = null,
  entidadId = null,
  empresaId = null,
  usuarioId = null,
  usuarioEmail = null,
  origen = null,
  ip = null,
  datos = null,
}) {
  db.prepare(
    `
    INSERT INTO audit_log (
      evento,
      entidad,
      entidad_id,
      empresa_id,
      usuario,
      origen,
      datos
    )
    VALUES (
      @evento,
      @entidad,
      @entidad_id,
      @empresa_id,
      @usuario,
      @origen,
      @datos
    )
  `,
  ).run({
    evento,
    entidad,
    entidad_id: entidadId,
    empresa_id: empresaId,
    usuario: usuarioEmail || usuarioId || null,
    origen: origen || ip || null,
    datos: datos
      ? JSON.stringify({
          usuarioId,
          usuarioEmail,
          ip,
          ...datos,
        })
      : null,
  });
}
function listAuditLogs({ empresaId, limit = 100 }) {
  return db
    .prepare(
      `
    SELECT *
    FROM audit_log
    WHERE empresa_id = ?
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(empresaId, Number(limit));
}
module.exports = {
  saveAuditLog,
  listAuditLogs,
};
