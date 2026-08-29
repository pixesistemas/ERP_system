const db = require("../db/database");

function crearRelacion({
  empresaId,
  documentoOrigenId,
  documentoDestinoId,
  tipo,
  observaciones = null,
}) {
  db.prepare(
    `
    INSERT OR IGNORE INTO documento_relaciones (
      empresa_id,
      documento_origen_id,
      documento_destino_id,
      tipo,
      observaciones
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(empresaId, documentoOrigenId, documentoDestinoId, tipo, observaciones);
}

function listarRelacionesDocumento({ empresaId, documentoId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM documento_relaciones
    WHERE empresa_id = ?
      AND (
        documento_origen_id = ?
        OR documento_destino_id = ?
      )
    ORDER BY id
  `,
    )
    .all(empresaId, documentoId, documentoId);
}

module.exports = {
  crearRelacion,
  listarRelacionesDocumento,
};
