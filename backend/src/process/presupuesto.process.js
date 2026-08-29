const crearDocumentoProcess = require("./crearDocumento.process");

/*
 * Crea un presupuesto comercial utilizando
 * el proceso general de documentos.
 */
async function presupuestoProcess(payload = {}) {
  return crearDocumentoProcess({
    ...payload,

    /*
     * Informa el tipo exacto esperado
     * por crearDocumentoProcess.
     */
    tipo: "PRESUPUESTO",
  });
}

module.exports = presupuestoProcess;
