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
  IVA_RESPONSABLE_NO_INSCRIPTO: 2,
  IVA_NO_RESPONSABLE: 3,
  IVA_SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  RESPONSABLE_MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
  PROVEEDOR_DEL_EXTERIOR: 8,
  CLIENTE_DEL_EXTERIOR: 9,
  IVA_LIBERADO_LEY_19640: 10,
  IVA_RI_AGENTE_PERCEPCION: 11,
  PEQUENO_CONTRIBUYENTE_EVENTUAL: 12,
  MONOTRIBUTISTA_SOCIAL: 13,
  PEQUENO_CONTRIBUYENTE_EVENTUAL_SOCIAL: 14,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO: 16,
  // Alias retrocompatibles
  MONOTRIBUTO: 6,
  IVA_EXENTO: 4,
};

/*
 * Tabla "Condición frente al IVA del receptor" de ARCA (RG 5616/2024).
 * Es la fuente de verdad local; debe coincidir con el método
 * FEParamGetCondicionIvaReceptor del WSFE.
 */
const CONDICION_IVA_RECEPTOR_TABLA = {
  1: "IVA Responsable Inscripto",
  2: "IVA Responsable no Inscripto",
  3: "IVA no Responsable",
  4: "IVA Sujeto Exento",
  5: "Consumidor Final",
  6: "Responsable Monotributo",
  7: "Sujeto no Categorizado",
  8: "Proveedor del Exterior",
  9: "Cliente del Exterior",
  10: "IVA Liberado - Ley Nº 19.640",
  11: "IVA Responsable Inscripto - Agente de Percepción",
  12: "Pequeño Contribuyente Eventual",
  13: "Monotributista Social",
  14: "Pequeño Contribuyente Eventual Social",
  15: "IVA No Alcanzado",
  16: "Monotributo Trabajador Independiente Promovido",
};

/*
 * Códigos admitidos según la letra del comprobante (campo Cmp_Clase de ARCA).
 * Si se informa un código que no corresponde a la clase, ARCA rechaza con
 * error 4962. La clase C admite todas las condiciones.
 */
const CONDICION_IVA_RECEPTOR_POR_CLASE = {
  A: [1, 6, 13, 16],
  B: [2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15],
  C: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

/*
 * Devuelve un CondicionIVAReceptorId válido para la letra del comprobante.
 * Si el código recibido no es válido para esa clase, cae a un valor seguro
 * (1 para A, 5 para B/C) para no ser rechazado por ARCA.
 */
function condicionIvaReceptorParaClase(id, letra) {
  const codigo = Number(id);
  const permitidos = CONDICION_IVA_RECEPTOR_POR_CLASE[letra];
  if (!permitidos) return codigo;
  if (permitidos.includes(codigo)) return codigo;
  return letra === "A"
    ? CONDICION_IVA_RECEPTOR.IVA_RESPONSABLE_INSCRIPTO
    : CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
}

function condicionIvaReceptorValida(id) {
  return Boolean(CONDICION_IVA_RECEPTOR_TABLA[Number(id)]);
}
function normalizarCondicionIVA(value) {
  const v = String(value || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/\./g, " ");
  if (v === "RI" || v === "RESPONSABLE INSCRIPTO" || v === "RESP INSCRIPTO") return RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO;
  if (v === "MONOTRIBUTO" || v === "MONOTRIBUTISTA" || v === "RESPONSABLE MONOTRIBUTO") return RESPONSABILIDAD_IVA.MONOTRIBUTO;
  if (v === "EXENTO" || v === "IVA EXENTO" || v === "EXENTO DE IVA" || v === "IVA SUJETO EXENTO" || v === "SUJETO EXENTO") return RESPONSABILIDAD_IVA.EXENTO;
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
  CONDICION_IVA_RECEPTOR_TABLA,
  CONDICION_IVA_RECEPTOR_POR_CLASE,
  condicionIvaReceptorParaClase,
  condicionIvaReceptorValida,
  normalizarCondicionIVA,
  getLetraComprobante,
  getNombreComprobante,
};
