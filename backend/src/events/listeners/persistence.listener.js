const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");

const { saveFactura } = require("../../repositories/factura.repository");

function registerPersistenceListeners() {
  eventBus.listen(EVENTS.FACTURA_EMITIDA, (payload) => {
    const saved = saveFactura({
      empresaId: payload.factura.empresa.id,
      request: payload.request,
      response: payload.response,
    });

    console.log("Factura guardada en SQLite");

    eventBus.emitEvent(EVENTS.FACTURA_GUARDADA, {
      ...payload,
      saved,
    });
  });
}

module.exports = registerPersistenceListeners;
