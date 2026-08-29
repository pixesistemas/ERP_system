const ProcessEngine = require("./processEngine");

const ventaProcess = require("./venta.process");
const notaPedidoProcess = require("./notaPedido.process");
const presupuestoProcess = require("./presupuesto.process");
const remitoProcess = require("./remito.process");
const convertirDocumentoProcess = require("./convertirDocumento.process");
const facturarDocumentoProcess = require("./facturarDocumento.process");
const crearDocumentoProcess = require("./crearDocumento.process");
const notaCreditoProcess = require("./notaCredito.process");

function registerProcesses() {
  ProcessEngine.register("VENTA", ventaProcess);

  ProcessEngine.register("CREAR_NOTA_PEDIDO", notaPedidoProcess);

  ProcessEngine.register("CREAR_PRESUPUESTO", presupuestoProcess);

  ProcessEngine.register("CREAR_REMITO", remitoProcess);

  ProcessEngine.register("CREAR_NOTA_CREDITO", notaCreditoProcess);

  ProcessEngine.register("CONVERTIR_DOCUMENTO", convertirDocumentoProcess);
  ProcessEngine.register("FACTURAR_DOCUMENTO", facturarDocumentoProcess);
}

module.exports = registerProcesses;
