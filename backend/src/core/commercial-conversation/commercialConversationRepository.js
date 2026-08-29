const db = require("../../db/database");

/*
 * CommercialConversationRepository
 *
 * Persiste el contexto comercial utilizando
 * la tabla general de conversaciones.
 */
class CommercialConversationRepository {
  /*
   * Busca una conversación activa por empresa,
   * teléfono y canal.
   */
  findActiveByPhone({ empresaId, telefono, canal = "WHATSAPP" }) {
    return db
      .prepare(
        `
        SELECT
          id,
          empresa_id,
          telefono,
          canal,
          estado,
          workspace_id,
          session_id,
          contexto,
          created_at,
          updated_at
        FROM conversations
        WHERE empresa_id = ?
          AND telefono = ?
          AND canal = ?
          AND estado NOT IN (
            'COMPLETED',
            'FINISHED',
            'CANCELLED'
          )
        ORDER BY id DESC
        LIMIT 1
        `,
      )
      .get(empresaId, telefono, canal);
  }

  /*
   * Busca una conversación por ID y empresa.
   */
  findById({ id, empresaId }) {
    return db
      .prepare(
        `
        SELECT
          id,
          empresa_id,
          telefono,
          canal,
          estado,
          workspace_id,
          session_id,
          contexto,
          created_at,
          updated_at
        FROM conversations
        WHERE id = ?
          AND empresa_id = ?
        LIMIT 1
        `,
      )
      .get(id, empresaId);
  }

  /*
   * Crea una conversación persistida.
   */
  create({
    empresaId,
    telefono,
    canal,
    estado,
    workspaceId,
    sessionId = null,
    contexto,
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
          contexto,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        `,
      )
      .run(
        empresaId,
        telefono,
        canal,
        estado,
        workspaceId,
        sessionId,
        contexto,
      );

    return this.findById({
      id: Number(result.lastInsertRowid),
      empresaId,
    });
  }

  /*
   * Actualiza el estado y el contexto completo.
   */
  update({ id, empresaId, estado, workspaceId, sessionId = null, contexto }) {
    db.prepare(
      `
      UPDATE conversations
      SET
        estado = ?,
        workspace_id = ?,
        session_id = ?,
        contexto = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
      `,
    ).run(estado, workspaceId, sessionId, contexto, id, empresaId);

    return this.findById({
      id,
      empresaId,
    });
  }

  /*
   * Lista las conversaciones recientes.
   */
  list({ empresaId, limit = 50 }) {
    return db
      .prepare(
        `
        SELECT
          id,
          empresa_id,
          telefono,
          canal,
          estado,
          workspace_id,
          session_id,
          contexto,
          created_at,
          updated_at
        FROM conversations
        WHERE empresa_id = ?
        ORDER BY id DESC
        LIMIT ?
        `,
      )
      .all(empresaId, Number(limit));
  }
}

module.exports = new CommercialConversationRepository();
