const CommercialConversation = require("../core/commercial-conversation");
const AIConversation = require("../services/aiConversation.service");

/*
 * Obtiene el ID de la empresa autenticada.
 */
function getEmpresaId(req) {
  return req.empresa?.id ? Number(req.empresa.id) : null;
}

/*
 * Obtiene el ID del usuario autenticado.
 */
function getUsuarioId(req) {
  return req.usuario?.id ? Number(req.usuario.id) : null;
}

/*
 * Obtiene el nombre de la empresa autenticada.
 */
function getEmpresaNombre(req) {
  return String(req.empresa?.nombre || "");
}
/*
 * Recibe un mensaje y continúa o inicia
 * una conversación comercial.
 */
async function message(req, res, next) {
  try {
    const empresaId = getEmpresaId(req);

    const usuarioId = getUsuarioId(req);

    const empresaNombre = getEmpresaNombre(req);

    const { telefono, mensaje, canal = "WHATSAPP" } = req.body || {};

    if (!empresaId) {
      const error = new Error("No se pudo determinar la empresa.");

      error.status = 400;

      throw error;
    }

    if (!mensaje?.trim()) {
      const error = new Error("El mensaje es obligatorio.");

      error.status = 400;

      throw error;
    }

    /*
     * Recupera la conversación activa del teléfono.
     */
    let conversation = CommercialConversation.Service.findActive({
      empresaId,
      telefono,
      canal,
    });

    const normalizedMessage = await AIConversation.normalizeUserMessage({
      message: mensaje,
      state: conversation?.context?.state || "INICIO",
      command: conversation?.context?.command?.toPlainObject?.() || null,
    });

    let result;

    /*
     * Si no existe conversación, crea un contexto
     * desde el mensaje completo.
     */
    if (!conversation) {
      const context = CommercialConversation.Engine.start({
        message: normalizedMessage,
        channel: canal,
      });

      conversation = CommercialConversation.Service.create({
        empresaId,
        telefono,
        canal,
        context,
      });

      result = await CommercialConversation.Engine.execute({
        context: conversation.context,

        empresaId,
        usuarioId,
        empresaNombre,
      });
    } else {
      /*
       * Continúa utilizando el contexto persistido.
       */
      result = await CommercialConversation.Engine.continue({
        context: conversation.context,

        message: normalizedMessage,

        empresaId,
        usuarioId,
        empresaNombre,
      });
    }

    /*
     * Persiste cualquier cambio de estado,
     * resolución o workspace.
     */
    conversation = CommercialConversation.Service.save(conversation);

    if (result?.response?.message) {
      result.response.message = await AIConversation.naturalizeResponse({
        message: result.response.message,
        state: conversation.context.state,
      });
    }

    return res.json({
      ok: true,

      conversation: {
        id: conversation.id,

        telefono: conversation.telefono,

        canal: conversation.canal,

        estado: conversation.context.state,

        workspaceId: conversation.context.workspaceId,
      },

      command: conversation.context.command.toPlainObject(),

      validation: conversation.context.command.validation,

      response: result.response,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Obtiene una conversación comercial por ID.
 */
function getById(req, res, next) {
  try {
    const empresaId = getEmpresaId(req);

    const conversation = CommercialConversation.Service.findById({
      id: Number(req.params.id),

      empresaId,
    });

    if (!conversation) {
      const error = new Error("Conversación no encontrada.");

      error.status = 404;

      throw error;
    }

    return res.json({
      ok: true,

      conversation: {
        id: conversation.id,

        empresaId: conversation.empresaId,

        telefono: conversation.telefono,

        canal: conversation.canal,

        createdAt: conversation.createdAt,

        updatedAt: conversation.updatedAt,

        ...conversation.context.toPlainObject(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Lista conversaciones comerciales recientes.
 */
function list(req, res, next) {
  try {
    const empresaId = getEmpresaId(req);

    const conversations = CommercialConversation.Service.list({
      empresaId,

      limit: Number(req.query.limit || 50),
    });

    return res.json({
      ok: true,

      conversations: conversations.map((conversation) => ({
        id: conversation.id,

        telefono: conversation.telefono,

        canal: conversation.canal,

        estado: conversation.context.state,

        workspaceId: conversation.context.workspaceId,

        command: conversation.context.command.toPlainObject(),

        createdAt: conversation.createdAt,

        updatedAt: conversation.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  message,
  getById,
  list,
};
