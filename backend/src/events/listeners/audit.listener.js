const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");

const { saveAuditLog } = require("../../repositories/audit.repository");

function registerAuditListeners() {
  eventBus.listen(EVENTS.FACTURA_EMITIDA, (payload) => {
    saveAuditLog({
      evento: EVENTS.FACTURA_EMITIDA,
      entidad: "factura",
      entidadId: payload.response.numero,
      empresaId: payload.factura.empresa.id,
      usuarioId: payload.context?.usuarioId,
      usuarioEmail: payload.context?.usuarioEmail,
      ip: payload.context?.ip,
      origen: payload.context?.origen || "api",
      datos: {
        request: payload.request,
        response: payload.response,
      },
    });
  });

  eventBus.listen(EVENTS.FACTURA_RECHAZADA, (payload) => {
    saveAuditLog({
      evento: EVENTS.FACTURA_RECHAZADA,
      entidad: "factura",
      entidadId: payload.response.numero,
      empresaId: payload.factura.empresa.id,
      usuarioId: payload.context?.usuarioId,
      usuarioEmail: payload.context?.usuarioEmail,
      ip: payload.context?.ip,
      origen: payload.context?.origen || "api",
      datos: {
        request: payload.request,
        response: payload.response,
      },
    });
  });

  eventBus.listen(EVENTS.FACTURA_GUARDADA, (payload) => {
    saveAuditLog({
      evento: EVENTS.FACTURA_GUARDADA,
      entidad: "factura",
      entidadId: payload.saved.facturaId,
      empresaId: payload.factura.empresa.id,
      usuarioId: payload.context?.usuarioId,
      usuarioEmail: payload.context?.usuarioEmail,
      ip: payload.context?.ip,
      origen: payload.context?.origen || "api",
      datos: payload.saved,
    });
  });
}

module.exports = registerAuditListeners;
