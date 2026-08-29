const { hashRequest, getIdempotency, saveIdempotency } = require("../repositories/idempotency.repository");

const WhatsAppClienteFlow = require("../services/whatsappClienteFlow.service");

/*
 * Tipos de comando que un cliente final puede pedir por este canal.
 * UNKNOWN se permite porque son los mensajes de continuación de una
 * conversación ya empezada (confirmaciones, cantidades, etc.) que no
 * vuelven a mencionar el tipo de documento.
 */
const { TIPOS_PERMITIDOS } = WhatsAppClienteFlow;

/*
 * Recibe mensajes de clientes finales (ya aprobados por un administrador,
 * ver whatsappClienteAuth.middleware.js) y ejecuta el mismo motor
 * conversacional que usa el resto del sistema, pero restringido a crear
 * notas de pedido — nunca facturas, presupuestos ni remitos directamente.
 */
async function message(req, res, next) {
  try {
    const empresaId = Number(req.empresa?.id || 0);
    const empresaNombre = String(req.empresa?.nombre || "").trim();
    const telefono = String(req.clienteWhatsapp?.telefono || "").trim();
    const mensaje = extractMessage(req.body);
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(401).json({ ok: false, error: "No se pudo identificar la empresa." });
    }
    if (!telefono) {
      return res.status(401).json({ ok: false, error: "No se pudo identificar el teléfono de WhatsApp." });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: "Falta header Idempotency-Key" });
    }
    if (!mensaje) {
      return res.status(400).json({ ok: false, error: "Debe informar mensaje" });
    }

    const requestPayload = { empresaId, telefono, canal: "WHATSAPP_CLIENTE", mensaje };
    const requestHash = hashRequest({ proceso: "WHATSAPP_CLIENTE_PEDIDO", payload: requestPayload });

    const existing = getIdempotency({ empresaId, key: idempotencyKey });
    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({ ok: false, error: "Idempotency-Key reutilizada con datos diferentes" });
      }
      return res.json({ ...parseStoredResponse(existing.response_json), idempotentReplay: true });
    }

    const response = await WhatsAppClienteFlow.mensajeCliente({
      empresaId,
      empresaNombre,
      telefono,
      mensaje,
      req,
    });

    saveIdempotency({ empresaId, key: idempotencyKey, requestHash, response });

    return res.json(response);
  } catch (error) {
    next(error);
  }
}

function extractMessage(body = {}) {
  const directMessage = body.mensaje || body.message || body.text || body.body || null;
  if (typeof directMessage === "string") return directMessage.trim();

  const nestedText = body.text?.body || body.message?.text || body.message?.body || null;
  if (typeof nestedText === "string") return nestedText.trim();

  const cloudMessage = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || null;
  if (typeof cloudMessage === "string") return cloudMessage.trim();

  return "";
}

function parseStoredResponse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    const error = new Error("La respuesta de idempotencia guardada no es válida.");
    error.statusCode = 500;
    throw error;
  }
}

module.exports = { message };
