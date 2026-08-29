const crearDocumentoProcess = require("./crearDocumento.process");

async function remitoProcess(payload) {
  return crearDocumentoProcess({
    ...payload,
    tipo: "REMITO",
  });
}

module.exports = remitoProcess;
