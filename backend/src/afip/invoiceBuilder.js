const {
  RESPONSABILIDAD_IVA,
  OPERACION,
  normalizarCondicionIVA,
} = require("./fiscal.constants");

const {
  resolverTipoComprobante,
  resolverDocumentoCliente,
  resolverCondicionIVAReceptor,
} = require("./fiscalResolver");

const TotalsCalculator = require("../billing/calculators/totalsCalculator");

function buildInvoiceRequest(data, empresaConfig) {
  const empresaIVA = normalizarCondicionIVA(empresaConfig.condicionIVA);

  const cliente = data.cliente || {};

  const clienteIVA =
    normalizarCondicionIVA(cliente.condicionIVA) ||
    RESPONSABILIDAD_IVA.CONSUMIDOR_FINAL;

  const operacion = data.operacion || OPERACION.FACTURA;

  const tipoComprobante = resolverTipoComprobante({
    empresaIVA,
    clienteIVA,
    operacion,
  });

  const documento = resolverDocumentoCliente(cliente);
  const condicionIVAReceptorId = resolverCondicionIVAReceptor(cliente);

  const totals = TotalsCalculator.calculate(data.items || [], empresaIVA);

  return {
    empresa: data.empresa,
    empresaId: empresaConfig.id,

    puntoVenta: data.puntoVenta || empresaConfig.puntoVenta || 1,
    tipoComprobante,
    concepto: data.concepto || 1,

    docTipo: documento.docTipo,
    docNro: documento.docNro,

    importeNeto: totals.importeNeto,
    importeIva: totals.importeIva,
    importeTotal: totals.importeTotal,
    iva: totals.iva,

    moneda: data.moneda || "PES",
    cotizacion: Number(data.cotizacion || 1),
    condicionVenta: data.condicionVenta || "CONTADO",

    operacion,
    cliente,
    items: totals.items,
    condicionIVAReceptorId,
  };
}

module.exports = {
  buildInvoiceRequest,
};
