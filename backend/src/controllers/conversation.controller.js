const Conversation = require("../core/conversation");

/*
 * Inicia una conversación nueva o recupera
 * la conversación activa del mismo teléfono.
 */
function iniciar(req, res, next) {
  try {
    const telefono = req.body.telefono || req.whatsapp?.telefono || null;

    const canal = req.body.canal || (req.whatsapp ? "WHATSAPP" : "API");

    const conversation = Conversation.Engine.start({
      empresaId: req.empresa.id,
      telefono,
      canal,
    });

    res.json({
      ok: true,
      conversation: conversation.toPlainObject(),
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Lista las conversaciones recientes
 * pertenecientes a la empresa autenticada.
 */
function listar(req, res, next) {
  try {
    const conversations = Conversation.Service.list({
      empresaId: req.empresa.id,
      estado: req.query.estado || null,
      limit: Math.min(Number(req.query.limit || 50), 100),
    });

    res.json({
      ok: true,
      total: conversations.length,
      conversations: conversations.map((item) => item.toPlainObject()),
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Recupera una conversación específica
 * y valida que pertenezca a la empresa.
 */
function obtener(req, res, next) {
  try {
    const conversation = Conversation.Engine.load(Number(req.params.id));

    if (Number(conversation.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    res.json({
      ok: true,
      conversation: conversation.toPlainObject(),
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Guarda un valor dentro del contexto
 * de una conversación activa.
 */
function actualizarContexto(req, res, next) {
  try {
    const key = String(req.body.key || "").trim();

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar la clave del contexto",
      });
    }

    const current = Conversation.Engine.load(Number(req.params.id));

    if (Number(current.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    const conversation = Conversation.Engine.setContext({
      conversationId: Number(req.params.id),
      key,
      value: req.body.value,
    });

    res.json({
      ok: true,
      conversation: conversation.toPlainObject(),
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Cancela una conversación activa.
 */
function cancelar(req, res, next) {
  try {
    const current = Conversation.Engine.load(Number(req.params.id));

    if (Number(current.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    const conversation = Conversation.Engine.cancel(Number(req.params.id));

    res.json({
      ok: true,
      conversation: conversation.toPlainObject(),
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Finaliza correctamente una conversación.
 */
function finalizar(req, res, next) {
  try {
    const current = Conversation.Engine.load(Number(req.params.id));

    if (Number(current.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    const conversation = Conversation.Engine.finish(Number(req.params.id));

    res.json({
      ok: true,
      conversation: conversation.toPlainObject(),
    });
  } catch (error) {
    next(error);
  }
}
/*
 * Recibe un mensaje y ejecuta el flujo conversacional.
 */
async function mensaje(req, res, next) {
  try {
    const telefono = req.body.telefono || req.whatsapp?.telefono || null;

    const texto = String(req.body.mensaje || "").trim();

    if (!texto) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar mensaje",
      });
    }

    const result = await Conversation.Engine.receiveMessage({
      empresaId: req.empresa.id,
      empresaNombre: req.empresa.nombre,
      telefono,
      canal: req.body.canal || (req.whatsapp ? "WHATSAPP" : "API"),
      mensaje: texto,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  iniciar,
  listar,
  obtener,
  actualizarContexto,
  cancelar,
  finalizar,
  mensaje,
};
