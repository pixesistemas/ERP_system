const db = require("../db/database");

/*
 * Convierte una fila de SQLite en un objeto
 * más cómodo para el resto de la aplicación.
 */
function mapSession(row) {
  if (!row) return null;

  return {
    id: row.id,
    empresaId: row.empresa_id,
    usuarioId: row.usuario_id,
    nombre: row.nombre,
    estado: row.estado,
    canal: row.canal,
    telefonoOrigen: row.telefono_origen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

/*
 * Recupera una sesión junto con sus workspaces asociados.
 */
function getBusinessSessionById(id) {
  const row = db
    .prepare(
      `
    SELECT *
    FROM business_sessions
    WHERE id = ?
  `,
    )
    .get(id);

  if (!row) return null;

  const session = mapSession(row);

  session.workspaces = db
    .prepare(
      `
    SELECT
      bsw.id AS relation_id,
      bsw.orden,
      bsw.activo,
      w.*
    FROM business_session_workspaces bsw
    INNER JOIN workspaces w
      ON w.id = bsw.workspace_id
    WHERE bsw.session_id = ?
      AND bsw.activo = 1
    ORDER BY bsw.orden, bsw.id
  `,
    )
    .all(id);

  return session;
}

/*
 * Crea una nueva sesión de trabajo para un usuario.
 */
function createBusinessSession({
  empresaId,
  usuarioId = null,
  nombre,
  canal = "API",
  telefonoOrigen = null,
}) {
  const result = db
    .prepare(
      `
    INSERT INTO business_sessions (
      empresa_id,
      usuario_id,
      nombre,
      estado,
      canal,
      telefono_origen
    )
    VALUES (?, ?, ?, 'ACTIVA', ?, ?)
  `,
    )
    .run(empresaId, usuarioId, nombre, canal, telefonoOrigen);

  return getBusinessSessionById(result.lastInsertRowid);
}

/*
 * Agrega un workspace existente a una sesión.
 */
function addWorkspaceToSession({ sessionId, workspaceId, orden = 0 }) {
  db.prepare(
    `
    INSERT INTO business_session_workspaces (
      session_id,
      workspace_id,
      orden,
      activo
    )
    VALUES (?, ?, ?, 1)
    ON CONFLICT(session_id, workspace_id)
    DO UPDATE SET
      activo = 1,
      orden = excluded.orden
  `,
  ).run(sessionId, workspaceId, Number(orden || 0));

  return getBusinessSessionById(sessionId);
}

/*
 * Quita un workspace de la sesión sin eliminarlo del ERP.
 */
function removeWorkspaceFromSession({ sessionId, workspaceId }) {
  db.prepare(
    `
    UPDATE business_session_workspaces
    SET activo = 0
    WHERE session_id = ?
      AND workspace_id = ?
  `,
  ).run(sessionId, workspaceId);

  return getBusinessSessionById(sessionId);
}

/*
 * Cierra una sesión para impedir agregar nuevas operaciones.
 */
function closeBusinessSession({ sessionId, empresaId }) {
  const result = db
    .prepare(
      `
    UPDATE business_sessions
    SET
      estado = 'CERRADA',
      updated_at = CURRENT_TIMESTAMP,
      closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND empresa_id = ?
      AND estado = 'ACTIVA'
  `,
    )
    .run(sessionId, empresaId);

  if (result.changes === 0) {
    const error = new Error("Sesión no encontrada o ya cerrada");

    error.statusCode = 404;
    throw error;
  }

  return getBusinessSessionById(sessionId);
}

/*
 * Lista las sesiones de una empresa y usuario.
 */
function listBusinessSessions({
  empresaId,
  usuarioId = null,
  estado = null,
  limit = 50,
}) {
  let sql = `
    SELECT *
    FROM business_sessions
    WHERE empresa_id = ?
  `;

  const params = [empresaId];

  if (usuarioId) {
    sql += ` AND usuario_id = ?`;
    params.push(usuarioId);
  }

  if (estado) {
    sql += ` AND estado = ?`;
    params.push(estado);
  }

  sql += `
    ORDER BY id DESC
    LIMIT ?
  `;

  params.push(Number(limit));

  return db
    .prepare(sql)
    .all(...params)
    .map(mapSession);
}

module.exports = {
  createBusinessSession,
  getBusinessSessionById,
  addWorkspaceToSession,
  removeWorkspaceFromSession,
  closeBusinessSession,
  listBusinessSessions,
};
