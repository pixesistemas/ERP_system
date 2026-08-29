const RESPONSABILIDAD_IVA = {
  RESPONSABLE_INSCRIPTO: "RI",
  MONOTRIBUTO: "MONOTRIBUTO",
  CONSUMIDOR_FINAL: "CF",
  EXENTO: "EXENTO",
};

const OPERACION = {
  FACTURA: "FACTURA",
  NOTA_CREDITO: "NOTA_CREDITO",
  NOTA_DEBITO: "NOTA_DEBITO",
};

const COMPROBANTES = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,

  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,

  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
};

const DOCUMENTOS = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  SIN_IDENTIFICAR: 99,
};

const IVA = {
  IVA_0: 3,
  IVA_10_5: 4,
  IVA_21: 5,
  IVA_27: 6,
  IVA_5: 8,
  IVA_2_5: 9,
};

const CONDICION_IVA_RECEPTOR = {
  IVA_RESPONSABLE_INSCRIPTO: 1,
  MONOTRIBUTO: 6,
  CONSUMIDOR_FINAL: 5,
  IVA_EXENTO: 4,
};
function normalizarCondicionIVA(value) {
  const v = String(value || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/\./g, " ");
  if (v === "RI" || v === "RESPONSABLE INSCRIPTO" || v === "RESPONSABLE INSCRIPTO" || v === "RESP INSCRIPTO") return RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO;
  if (v === "MONOTRIBUTO" || v === "MONOTRIBUTISTA") return RESPONSABILIDAD_IVA.MONOTRIBUTO;
  if (v === "EXENTO" || v === "IVA EXENTO" || v === "EXENTO DE IVA") return RESPONSABILIDAD_IVA.EXENTO;
  if (v === "CF" || v === "CONSUMIDOR FINAL" || v === "FINAL" || v === "SIN RESPONSABILIDAD" || v === "NO RESPONSABLE" || v === "NO RESPONSABLE EXENTO") return RESPONSABILIDAD_IVA.CONSUMIDOR_FINAL;
  return String(value || "").trim();
}
function getLetraComprobante(tipo) {
  if ([1, 2, 3].includes(Number(tipo))) return "A";
  if ([6, 7, 8].includes(Number(tipo))) return "B";
  if ([11, 12, 13].includes(Number(tipo))) return "C";
  return null;
}

function getNombreComprobante(tipo) {
  const t = Number(tipo);

  const nombres = {
    1: "Factura A",
    2: "Nota de Débito A",
    3: "Nota de Crédito A",
    6: "Factura B",
    7: "Nota de Débito B",
    8: "Nota de Crédito B",
    11: "Factura C",
    12: "Nota de Débito C",
    13: "Nota de Crédito C",
  };

  return nombres[t] || `Comprobante ${t}`;
}

module.exports = {
  RESPONSABILIDAD_IVA,
  OPERACION,
  COMPROBANTES,
  DOCUMENTOS,
  IVA,
  CONDICION_IVA_RECEPTOR,
  normalizarCondicionIVA,
  getLetraComprobante,
  getNombreComprobante,
};
