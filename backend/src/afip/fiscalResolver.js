const {
  RESPONSABILIDAD_IVA,
  OPERACION,
  COMPROBANTES,
  DOCUMENTOS,
  CONDICION_IVA_RECEPTOR,
  normalizarCondicionIVA,
} = require("./fiscal.constants");

function resolverTipoComprobante({ empresaIVA, clienteIVA, operacion }) {
  const esFactura = operacion === OPERACION.FACTURA;
  const esNotaCredito = operacion === OPERACION.NOTA_CREDITO;
  const esNotaDebito = operacion === OPERACION.NOTA_DEBITO;

  if (!esFactura && !esNotaCredito && !esNotaDebito) {
    throw new Error(`Operación no soportada: ${operacion}`);
  }

  empresaIVA = normalizarCondicionIVA(empresaIVA);
  clienteIVA = normalizarCondicionIVA(clienteIVA);

  if (!empresaIVA) {
    throw new Error(`Condición IVA de empresa no soportada: ${empresaIVA}`);
  }

  if (empresaIVA === RESPONSABILIDAD_IVA.MONOTRIBUTO) {
    if (esFactura) return COMPROBANTES.FACTURA_C;
    if (esNotaCredito) return COMPROBANTES.NOTA_CREDITO_C;
    if (esNotaDebito) return COMPROBANTES.NOTA_DEBITO_C;
  }

  if (empresaIVA === RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO) {
    if (
      clienteIVA === RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO ||
      clienteIVA === RESPONSABILIDAD_IVA.MONOTRIBUTO
    ) {
      if (esFactura) return COMPROBANTES.FACTURA_A;
      if (esNotaCredito) return COMPROBANTES.NOTA_CREDITO_A;
      if (esNotaDebito) return COMPROBANTES.NOTA_DEBITO_A;
    }

    if (esFactura) return COMPROBANTES.FACTURA_B;
    if (esNotaCredito) return COMPROBANTES.NOTA_CREDITO_B;
    if (esNotaDebito) return COMPROBANTES.NOTA_DEBITO_B;
  }

  throw new Error(`Condición IVA de empresa no soportada: ${empresaIVA}`);
}

function resolverDocumentoCliente(cliente) {
  if (cliente.cuit) {
    return {
      docTipo: DOCUMENTOS.CUIT,
      docNro: Number(cliente.cuit),
    };
  }

  if (cliente.dni) {
    return {
      docTipo: DOCUMENTOS.DNI,
      docNro: Number(cliente.dni),
    };
  }

  return {
    docTipo: DOCUMENTOS.SIN_IDENTIFICAR,
    docNro: 0,
  };
}
function resolverCondicionIVAReceptor(cliente) {
  const condicion = normalizarCondicionIVA(cliente.condicionIVA);

  if (condicion === RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO) {
    return CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO;
  }

  if (condicion === RESPONSABILIDAD_IVA.MONOTRIBUTO) {
    return CONDICION_IVA_RECEPTOR.MONOTRIBUTO;
  }

  if (condicion === RESPONSABILIDAD_IVA.EXENTO) {
    return CONDICION_IVA_RECEPTOR.IVA_EXENTO;
  }

  return CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
}

module.exports = {
  resolverTipoComprobante,
  resolverDocumentoCliente,
  resolverCondicionIVAReceptor,
};
