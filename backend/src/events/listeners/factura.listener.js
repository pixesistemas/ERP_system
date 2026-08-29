const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");

function registerFacturaListeners() {
  eventBus.listen(EVENTS.FACTURA_EMITIDA, (payload) => {
    console.log("Listener: factura emitida");
    console.log({
      numero: payload.response.numero,
      cae: payload.response.cae,
      empresa: payload.factura.empresa.nombre,
    });
  });

  eventBus.listen(EVENTS.FACTURA_RECHAZADA, (payload) => {
    console.log("Listener: factura rechazada");
    console.log(payload.response.observaciones);
  });
}

module.exports = registerFacturaListeners;
