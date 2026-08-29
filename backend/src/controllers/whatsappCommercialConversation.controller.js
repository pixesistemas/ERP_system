const CommercialConversation = require("../core/commercial-conversation");

const ResponseService = require("../services/whatsappCommercialResponse.service");

const { isTelefonoAutorizado } = require("../repositories/whatsapp.repository");

const {
  hashRequest,
  getIdempotency,
  saveIdempotency,
} = require("../repositories/idempotency.repository");

/*
 * Recibe mensajes naturales desde n8n o WhatsApp
 * y ejecuta la conversación comercial.
 */
async function message(req, res, next) {
  try {
    const empresaId = Number(req.empresa?.id || 0);

    const empresaNombre = String(req.empresa?.nombre || "").trim();

    const telefono = String(req.whatsapp?.telefono || "").trim();

    const mensaje = extractMessage(req.body);

    /*
     * Determina si quien escribe es un empleado autorizado
     * (teléfono dado de alta en whatsapp_autorizados). Habilita
     * acciones de back-office como facturar, nota de crédito y reservar stock.
     */
    const autorizado = isTelefonoAutorizado({ empresaId, telefono });

    const canal = "WHATSAPP";

    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

    /*
     * Valida los datos incorporados
     * por los middlewares de seguridad.
     */
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(401).json({
        ok: false,

        error: "No se pudo identificar la empresa.",
      });
    }

    if (!empresaNombre) {
      return res.status(401).json({
        ok: false,

        error: "La empresa autenticada no tiene nombre configurado.",
      });
    }

    if (!telefono) {
      return res.status(401).json({
        ok: false,

        error: "No se pudo identificar el teléfono de WhatsApp.",
      });
    }

    /*
     * Cada mensaje de WhatsApp debe tener
     * una clave de idempotencia.
     */
    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,

        error: "Falta header Idempotency-Key",
      });
    }

    if (!mensaje) {
      return res.status(400).json({
        ok: false,

        error: "Debe informar mensaje",
      });
    }

    /*
     * Calcula una firma estable para detectar
     * reutilización incorrecta de claves.
     */
    const requestPayload = {
      empresaId,
      telefono,
      canal,
      mensaje,
    };

    const requestHash = hashRequest({
      proceso: "COMMERCIAL_CONVERSATION_MESSAGE",

      payload: requestPayload,
    });

    /*
     * Devuelve la respuesta anterior cuando n8n
     * reintenta exactamente el mismo mensaje.
     */
    const existing = getIdempotency({
      empresaId,

      key: idempotencyKey,
    });

    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({
          ok: false,

          error: "Idempotency-Key reutilizada con datos diferentes",
        });
      }

      const replayResponse = parseStoredResponse(existing.response_json);

      return res.json({
        ...replayResponse,

        idempotentReplay: true,
      });
    }

    /*
     * Recupera la conversación activa asociada
     * a la empresa, teléfono y canal.
     */
    let conversation = CommercialConversation.Service.findActive({
      empresaId,
      telefono,
      canal,
    });

    let engineResult;

    /*
     * Cuando no hay conversación activa,
     * crea un contexto nuevo.
     */
    if (!conversation) {
      const context = CommercialConversation.Engine.start({
        message: mensaje,

        channel: canal,
      });

      /*
       * El teléfono se agrega al contexto antes
       * de persistirlo y crear el workspace.
       */
      context.telefonoOrigen = telefono;

      conversation = CommercialConversation.Service.create({
        empresaId,
        telefono,
        canal,
        context,
      });

      /*
       * Mantiene el teléfono aunque el repositorio
       * haya reconstruido el objeto de contexto.
       */
      conversation.context.telefonoOrigen = telefono;

      engineResult = await CommercialConversation.Engine.execute({
        context: conversation.context,

        empresaId,

        usuarioId: null,

        empresaNombre,

        autorizado,
      });
    } else {
      /*
       * Actualiza siempre el teléfono de origen.
       */
      conversation.context.telefonoOrigen = telefono;

      engineResult = await CommercialConversation.Engine.continue({
        context: conversation.context,

        message: mensaje,

        empresaId,

        usuarioId: null,

        empresaNombre,

        autorizado,
      });
    }

    /*
     * Persiste los cambios de estado,
     * workspace y comando comercial.
     */
    conversation = CommercialConversation.Service.save(conversation);

    /*
     * Construye la respuesta uniforme
     * que consumirá n8n.
     */
    const response = ResponseService.build({
      req,
      conversation,
      engineResult,

      idempotentReplay: false,
    });

    /*
     * Guarda la respuesta final para evitar
     * documentos duplicados en reintentos.
     */
    saveIdempotency({
      empresaId,

      key: idempotencyKey,

      requestHash,

      response,
    });

    return res.json(response);
  } catch (error) {
    next(error);
  }
}

/*
 * Extrae el texto desde distintos formatos
 * comunes de webhooks de WhatsApp y n8n.
 */
function extractMessage(body = {}) {
  const directMessage =
    body.mensaje || body.message || body.text || body.body || null;

  if (typeof directMessage === "string") {
    return directMessage.trim();
  }

  /*
   * Permite recibir:
   *
   * {
   *   text: {
   *     body: "mensaje"
   *   }
   * }
   */
  const nestedText =
    body.text?.body || body.message?.text || body.message?.body || null;

  if (typeof nestedText === "string") {
    return nestedText.trim();
  }

  /*
   * Formato habitual de WhatsApp Cloud API.
   */
  const cloudMessage =
    body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || null;

  if (typeof cloudMessage === "string") {
    return cloudMessage.trim();
  }

  return "";
}

/*
 * Recupera una respuesta guardada
 * por el repositorio de idempotencia.
 */
function parseStoredResponse(value) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    const error = new Error(
      "La respuesta de idempotencia guardada no es válida.",
    );

    error.statusCode = 500;

    throw error;
  }
}

module.exports = {
  message,
};
