const States = require("./conversationStates");

const {
  createConversation,
  getConversationById,
  getActiveConversation,
  saveConversation,
  listConversations,
} = require("./conversation.repository");

/*
 * ConversationService
 *
 * Administra el ciclo de persistencia de las conversaciones.
 */
class ConversationService {
  /*
   * Inicia una conversación o recupera la activa del teléfono.
   */
  start({ empresaId, telefono = null, canal = "API" }) {
    if (!empresaId) {
      const error = new Error("Debe informar empresaId");

      error.statusCode = 400;
      throw error;
    }

    if (telefono) {
      const active = getActiveConversation({
        empresaId,
        telefono,
      });

      if (active) {
        return active;
      }
    }

    return createConversation({
      empresaId,
      telefono,
      canal,
      estado: States.IDLE,
      contexto: {},
    });
  }

  /*
   * Recupera una conversación por ID.
   */
  load(conversationId) {
    const conversation = getConversationById(conversationId);

    if (!conversation) {
      const error = new Error("Conversación no encontrada");

      error.statusCode = 404;
      throw error;
    }

    return conversation;
  }

  /*
   * Busca la conversación activa de un teléfono.
   */
  loadActive({ empresaId, telefono }) {
    return getActiveConversation({
      empresaId,
      telefono,
    });
  }

  /*
   * Guarda los cambios de una conversación.
   */
  save(conversation) {
    return saveConversation(conversation);
  }

  /*
   * Finaliza y guarda una conversación.
   */
  finish(conversationId) {
    const conversation = this.load(conversationId);

    conversation.finish();

    return this.save(conversation);
  }

  /*
   * Cancela y guarda una conversación.
   */
  cancel(conversationId) {
    const conversation = this.load(conversationId);

    conversation.cancel();

    return this.save(conversation);
  }

  /*
   * Lista conversaciones de una empresa.
   */
  list(filters) {
    return listConversations(filters);
  }
}

module.exports = new ConversationService();
