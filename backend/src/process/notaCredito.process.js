const crearDocumentoProcess = require("./crearDocumento.process");

/*
 * Crea una nota de crédito a partir del workspace
 * confirmado. Reutiliza el proceso genérico de documentos.
 */
async function notaCreditoProcess(payload) {
  return crearDocumentoProcess({
    ...payload,
    tipo: "NOTA_CREDITO",
  });
}

module.exports = notaCreditoProcess;
