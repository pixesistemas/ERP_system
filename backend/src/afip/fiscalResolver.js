const {
  RESPONSABILIDAD_IVA,
  OPERACION,
  COMPROBANTES,
  DOCUMENTOS,
  CONDICION_IVA_RECEPTOR,
  CONDICION_IVA_RECEPTOR_TABLA,
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
  const raw = cliente?.condicionIVA;

  // Si ya viene un código numérico válido de la tabla, se respeta.
  const numerico = Number(raw);
  if (Number.isInteger(numerico) && CONDICION_IVA_RECEPTOR_TABLA[numerico]) {
    return numerico;
  }

  const condicion = normalizarCondicionIVA(raw);

  const mapa = {
    [RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO]:
      CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO,
    [RESPONSABILIDAD_IVA.MONOTRIBUTO]:
      CONDICION_IVA_RECEPTOR.RESPONSABLE_MONOTRIBUTO,
    [RESPONSABILIDAD_IVA.EXENTO]:
      CONDICION_IVA_RECEPTOR.IVA_SUJETO_EXENTO,
    [RESPONSABILIDAD_IVA.CONSUMIDOR_FINAL]:
      CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
  };

  if (mapa[condicion] != null) return mapa[condicion];

  // Otras condiciones que la base puede guardar como texto libre.
  if (/RESPONSABLE NO INSCRIPTO|NO INSCRIPTO/.test(condicion)) {
    return CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_NO_INSCRIPTO;
  }
  if (/IVA NO RESPONSABLE|^NO RESPONSABLE/.test(condicion)) {
    return CONDICION_IVA_RECEPTOR.IVA_NO_RESPONSABLE;
  }
  if (/NO CATEGORIZADO/.test(condicion)) {
    return CONDICION_IVA_RECEPTOR.SUJETO_NO_CATEGORIZADO;
  }
  if (/AGENTE DE PERCEPCION/.test(condicion)) {
    return CONDICION_IVA_RECEPTOR.IVA_RI_AGENTE_PERCEPCION;
  }

  return CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
}

module.exports = {
  resolverTipoComprobante,
  resolverDocumentoCliente,
  resolverCondicionIVAReceptor,
};
