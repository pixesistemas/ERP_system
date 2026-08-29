const Repository = require("./commercialConversationRepository");

const CommercialCommandContext = require("./commercialCommandContext");

/*
 * CommercialConversationService
 *
 * Convierte registros de base de datos en contextos
 * comerciales y administra su persistencia.
 */
class CommercialConversationService {
  /*
   * Busca una conversación comercial activa.
   */
  findActive({ empresaId, telefono, canal = "WHATSAPP" }) {
    const row = Repository.findActiveByPhone({
      empresaId,
      telefono: this.normalizePhone(telefono),
      canal: this.normalizeChannel(canal),
    });

    return row ? this.hydrate(row) : null;
  }

  /*
   * Crea una conversación nueva.
   */
  create({
    empresaId,
    telefono,
    canal = "WHATSAPP",
    context,
    sessionId = null,
  }) {
    const row = Repository.create({
      empresaId,

      telefono: this.normalizePhone(telefono),

      canal: this.normalizeChannel(canal),

      estado: context.state,

      workspaceId: context.workspaceId,

      sessionId,

      contexto: JSON.stringify(context.toPlainObject()),
    });

    return this.hydrate(row);
  }

  /*
   * Guarda el contexto actual.
   */
  save(conversation) {
    if (
      !conversation?.id ||
      !conversation?.empresaId ||
      !conversation?.context
    ) {
      const error = new Error("La conversación comercial no es válida.");

      error.status = 400;

      throw error;
    }

    const row = Repository.update({
      id: conversation.id,

      empresaId: conversation.empresaId,

      estado: conversation.context.state,

      workspaceId: conversation.context.workspaceId,

      sessionId: conversation.sessionId,

      contexto: JSON.stringify(conversation.context.toPlainObject()),
    });

    return this.hydrate(row);
  }

  /*
   * Busca una conversación por ID.
   */
  findById({ id, empresaId }) {
    const row = Repository.findById({
      id,
      empresaId,
    });

    return row ? this.hydrate(row) : null;
  }

  /*
   * Lista conversaciones comerciales.
   */
  list({ empresaId, limit = 50 }) {
    return Repository.list({
      empresaId,
      limit,
    }).map((row) => this.hydrate(row));
  }

  /*
   * Convierte un registro SQLite en un objeto comercial.
   */
  hydrate(row) {
    let plainContext = {};

    try {
      plainContext = row.contexto ? JSON.parse(row.contexto) : {};
    } catch (error) {
      plainContext = {};
    }

    return {
      id: row.id,

      empresaId: row.empresa_id,

      telefono: row.telefono,

      canal: row.canal,

      estado: row.estado,

      workspaceId: row.workspace_id,

      sessionId: row.session_id,

      createdAt: row.created_at,

      updatedAt: row.updated_at,

      context: CommercialCommandContext.fromPlainObject({
        ...plainContext,

        /*
         * Los campos principales de la tabla
         * tienen prioridad sobre el JSON.
         */
        state: row.estado || plainContext.state,

        workspaceId: row.workspace_id || plainContext.workspaceId,
      }),
    };
  }

  /*
   * Normaliza el teléfono para evitar conversaciones duplicadas.
   */
  normalizePhone(value) {
    const phone = String(value || "")
      .replace(/\D/g, "")
      .trim();

    if (!phone) {
      const error = new Error("El teléfono es obligatorio.");

      error.status = 400;

      throw error;
    }

    return phone;
  }

  /*
   * Normaliza el canal de origen.
   */
  normalizeChannel(value) {
    return String(value || "WHATSAPP")
      .trim()
      .toUpperCase();
  }
}

module.exports = new CommercialConversationService();
