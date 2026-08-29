const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");

const { saveEvent } = require("../../repositories/eventStore.repository");

function registerEventStoreListeners() {
  const eventos = Object.values(EVENTS);

  for (const evento of eventos) {
    eventBus.listen(evento, (payload) => {
      try {
        saveEvent({
          empresaId:
            payload.factura?.empresa?.id ||
            payload.empresa?.id ||
            payload.empresaId ||
            null,
          evento,
          entidad: payload.factura ? "factura" : null,
          entidadId:
            payload.saved?.facturaId || payload.response?.numero || null,
          usuarioId: payload.context?.usuarioId || null,
          origen: payload.context?.origen || "api",
          payload,
        });
      } catch (error) {
        console.error("Error guardando evento:");
        console.error(error.message);
      }
    });
  }
}

module.exports = registerEventStoreListeners;
