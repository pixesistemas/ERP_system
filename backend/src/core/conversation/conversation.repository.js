const db = require("../../db/database");
const Conversation = require("../../domain/Conversation");

/*
 * Convierte una fila de SQLite en una entidad Conversation.
 */
function mapConversation(row) {
  if (!row) return null;

  let contexto = {};

  try {
    contexto = row.contexto ? JSON.parse(row.contexto) : {};
  } catch (error) {
    contexto = {};
  }

  return new Conversation({
    id: row.id,
    empresaId: row.empresa_id,
    telefono: row.telefono,
    canal: row.canal,
    estado: row.estado,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    contexto,
  });
}

/*
 * Busca una conversación por ID.
 */
function getConversationById(id) {
  const row = db
    .prepare(
      `
    SELECT *
    FROM conversations
    WHERE id = ?
  `,
    )
    .get(id);

  return mapConversation(row);
}

/*
 * Busca la última conversación activa de un teléfono.
 */
function getActiveConversation({ empresaId, telefono }) {
  const row = db
    .prepare(
      `
    SELECT *
    FROM conversations
    WHERE empresa_id = ?
      AND telefono = ?
      AND estado NOT IN ('FINISHED', 'CANCELLED')
    ORDER BY id DESC
    LIMIT 1
  `,
    )
    .get(empresaId, String(telefono || ""));

  return mapConversation(row);
}

/*
 * Crea una conversación nueva.
 */
function createConversation({
  empresaId,
  telefono = null,
  canal = "API",
  estado = "IDLE",
  workspaceId = null,
  sessionId = null,
  contexto = {},
}) {
  const result = db
    .prepare(
      `
    INSERT INTO conversations (
      empresa_id,
      telefono,
      canal,
      estado,
      workspace_id,
      session_id,
      contexto
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      empresaId,
      telefono,
      canal,
      estado,
      workspaceId,
      sessionId,
      JSON.stringify(contexto || {}),
    );

  return getConversationById(result.lastInsertRowid);
}

/*
 * Guarda los cambios de una conversación existente.
 */
function saveConversation(conversation) {
  const data = conversation.toPlainObject();

  const result = db
    .prepare(
      `
    UPDATE conversations
    SET
      telefono = ?,
      canal = ?,
      estado = ?,
      workspace_id = ?,
      session_id = ?,
      contexto = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND empresa_id = ?
  `,
    )
    .run(
      data.telefono,
      data.canal,
      data.estado,
      data.workspaceId,
      data.sessionId,
      JSON.stringify(data.contexto || {}),
      data.id,
      data.empresaId,
    );

  if (result.changes === 0) {
    const error = new Error("No se pudo guardar la conversación");

    error.statusCode = 404;
    throw error;
  }

  return getConversationById(data.id);
}

/*
 * Lista conversaciones recientes de una empresa.
 */
function listConversations({ empresaId, estado = null, limit = 50 }) {
  let sql = `
    SELECT *
    FROM conversations
    WHERE empresa_id = ?
  `;

  const params = [empresaId];

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
    .map(mapConversation);
}

module.exports = {
  createConversation,
  getConversationById,
  getActiveConversation,
  saveConversation,
  listConversations,
};
