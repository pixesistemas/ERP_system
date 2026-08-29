const {
  ESTADOS,
  getSolicitud,
  registrarSolicitud,
} = require("../repositories/whatsappCliente.repository");
const { normalizePhone } = require("../utils/validators");

/*
 * A diferencia de whatsappAuth.middleware.js (que es para operadores
 * internos con lista blanca cerrada), este middleware está pensado para
 * clientes finales: cualquier número puede escribir. Si es la primera vez,
 * queda una solicitud pendiente de aprobación y se corta acá (no llega al
 * motor de conversación). Si ya fue aprobado, sigue con req.clienteWhatsapp
 * cargado. Si fue rechazado, se corta con un mensaje genérico.
 */
function whatsappClienteAuthMiddleware(req, res, next) {
  const telefono =
    req.headers["x-whatsapp-phone"] ||
    req.body.telefonoOrigen ||
    req.body.from ||
    req.body.phone;

  if (!telefono) {
    return res.status(401).json({
      ok: false,
      error: "Falta teléfono de origen WhatsApp",
    });
  }

  const telefonoNormalizado = normalizePhone(telefono);
  const nombreDeclarado = req.body.nombre || req.body.profileName || null;

  let solicitud = getSolicitud({
    empresaId: req.empresa.id,
    telefono: telefonoNormalizado,
  });

  if (!solicitud) {
    solicitud = registrarSolicitud({
      empresaId: req.empresa.id,
      telefono: telefonoNormalizado,
      nombreDeclarado,
    });

    return res.json({
      ok: true,
      estado: "PENDIENTE_APROBACION",
      respuesta:
        "¡Hola! Todavía no estás habilitado para pedir por este medio. " +
        "Ya avisamos a un administrador — en cuanto te aprueben vas a poder hacer pedidos acá.",
    });
  }

  if (solicitud.estado === ESTADOS.PENDIENTE) {
    return res.json({
      ok: true,
      estado: "PENDIENTE_APROBACION",
      respuesta: "Tu alta todavía está en revisión. En cuanto te aprueben te avisamos por acá.",
    });
  }

  if (solicitud.estado === ESTADOS.RECHAZADO) {
    return res.json({
      ok: true,
      estado: "RECHAZADO",
      respuesta: "No podemos tomar pedidos de este número por ahora. Comunicate con nosotros por otro medio.",
    });
  }

  req.clienteWhatsapp = {
    telefono: telefonoNormalizado,
    clienteId: solicitud.cliente_id,
  };

  next();
}

module.exports = whatsappClienteAuthMiddleware;
