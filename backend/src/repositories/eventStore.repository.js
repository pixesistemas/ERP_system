const db = require("../db/database");

function saveEvent({
  empresaId = null,
  evento,
  entidad = null,
  entidadId = null,
  usuarioId = null,
  origen = null,
  payload = null,
}) {
  db.prepare(
    `
    INSERT INTO event_store (
      empresa_id,
      evento,
      entidad,
      entidad_id,
      usuario_id,
      origen,
      payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    empresaId,
    evento,
    entidad,
    entidadId ? String(entidadId) : null,
    usuarioId,
    origen,
    payload ? JSON.stringify(payload) : null,
  );
}

function listEvents({ empresaId, limit = 100 }) {
  return db
    .prepare(
      `
    SELECT *
    FROM event_store
    WHERE empresa_id = ?
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(empresaId, Number(limit));
}

module.exports = {
  saveEvent,
  listEvents,
};
