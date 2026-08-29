const crearDocumentoProcess = require("./crearDocumento.process");

async function notaPedidoProcess(payload) {
  return crearDocumentoProcess({
    ...payload,
    tipo: "NOTA_PEDIDO",
  });
}

module.exports = notaPedidoProcess;
