const db = require("../db/database");

const PedidoConversacional = require("./pedidoConversacional.service");

const { normalizePhone } = require("../utils/validators");

const {
  getSolicitud,
  registrarSolicitud,
  ESTADOS,
} = require("../repositories/whatsappCliente.repository");

/*
 * WhatsAppClienteFlowService
 *
 * Flujo conversacional para clientes finales: verifica la autorización del
 * número (pendiente / aprobado / rechazado) y delega en
 * PedidoConversacional (motor de pedidos pensado para clientes). Lo usan
 * tanto el endpoint de n8n (/api/v1/whatsapp/pedidos/message) como el
 * simulador web del sistema, así los dos prueban exactamente el mismo
 * circuito.
 */

const TIPOS_PERMITIDOS = new Set(["NOTA_PEDIDO", "UNKNOWN"]);

const MENSAJE_NO_PERMITIDO =
  "Por acá solo puedo tomarte pedidos. Para otra consulta, comunicate con nosotros directamente.";

async function mensajeCliente({ empresaId, empresaNombre, telefono, mensaje, nombreDeclarado = null, req = null }) {
  const tel = normalizePhone(String(telefono || "").trim());

  if (!tel) {
    return { ok: false, error: "No se pudo identificar el teléfono de WhatsApp." };
  }

  let solicitud = getSolicitud({ empresaId, telefono: tel });

  if (!solicitud) {
    solicitud = registrarSolicitud({ empresaId, telefono: tel, nombreDeclarado });
    return {
      ok: true,
      estado: "PENDIENTE_APROBACION",
      respuesta:
        "¡Hola! Todavía no estás habilitado para pedir por este medio. " +
        "Ya avisamos a un administrador — en cuanto te aprueben vas a poder hacer pedidos acá.",
    };
  }

  if (solicitud.estado === ESTADOS.PENDIENTE) {
    return {
      ok: true,
      estado: "PENDIENTE_APROBACION",
      respuesta: "Tu alta todavía está en revisión. En cuanto te aprueben te avisamos por acá.",
    };
  }

  if (solicitud.estado === ESTADOS.RECHAZADO) {
    return {
      ok: true,
      estado: "RECHAZADO",
      respuesta: "No podemos tomar pedidos de este número por ahora. Comunicate con nosotros por otro medio.",
    };
  }

  const clienteId = solicitud.cliente_id || null;

  return PedidoConversacional.procesar({
    empresaId,
    empresaNombre,
    telefono: tel,
    clienteId,
    mensaje,
  });
}

module.exports = {
  mensajeCliente,
  TIPOS_PERMITIDOS,
  MENSAJE_NO_PERMITIDO,
};
