const {
  CONDICION_IVA_RECEPTOR_TABLA,
  CONDICION_IVA_RECEPTOR_POR_CLASE,
  condicionIvaReceptorParaClase,
} = require("../src/afip/fiscal.constants");
const { buildInvoiceRequest } = require("../src/afip/invoiceBuilder");

/*
 * Verificación RG 5616/2024: "Condición frente al IVA del receptor".
 *
 * 1) Muestra la tabla oficial de ARCA (códigos 1..16).
 * 2) Arma comprobantes para distintas condiciones del cliente y confirma
 *    que SIEMPRE se informa un CondicionIVAReceptorId válido y admitido
 *    por la clase del comprobante (A/B/C).
 *
 * Uso: node scripts/verificar-rg5616.js
 */

console.log("Tabla oficial ARCA - Condición frente al IVA del receptor:");
for (const [id, desc] of Object.entries(CONDICION_IVA_RECEPTOR_TABLA)) {
  const clases = Object.entries(CONDICION_IVA_RECEPTOR_POR_CLASE)
    .filter(([, ids]) => ids.includes(Number(id)))
    .map(([c]) => c)
    .join("/");
  console.log(`  ${String(id).padStart(2, "0")} - ${desc}  [clase ${clases}]`);
}

const empresaRI = { id: 1, nombre: "Empresa RI", condicionIVA: "RI", puntoVenta: 1 };
const empresaMONO = { id: 2, nombre: "Empresa Mono", condicionIVA: "MONOTRIBUTO", puntoVenta: 1 };

const casos = [
  { cliente: { razonSocial: "RI", condicionIVA: "RI", cuit: "20111111112" }, empresa: empresaRI },
  { cliente: { razonSocial: "Mono", condicionIVA: "MONOTRIBUTO", cuit: "20111111113" }, empresa: empresaRI },
  { cliente: { razonSocial: "CF", condicionIVA: "CF", dni: "12345678" }, empresa: empresaRI },
  { cliente: { razonSocial: "Exento", condicionIVA: "EXENTO", cuit: "20111111114" }, empresa: empresaRI },
  { cliente: { razonSocial: "Sin dato", condicionIVA: "", dni: "12345678" }, empresa: empresaRI },
  { cliente: { razonSocial: "RI a mono", condicionIVA: "RI", cuit: "20111111115" }, empresa: empresaMONO },
  { cliente: { razonSocial: "Codigo directo", condicionIVA: 7, cuit: "20111111116" }, empresa: empresaRI },
];

const items = [{ codigo: "X", descripcion: "Producto", cantidad: 1, precioUnitario: 100, iva: 21 }];

let errores = 0;
console.log("\nVerificación de comprobantes:");
for (const { cliente, empresa } of casos) {
  const req = buildInvoiceRequest(
    { empresa: empresa.nombre, operacion: "FACTURA", puntoVenta: 1, cliente, items },
    empresa,
  );
  const letra = { 1: "A", 2: "A", 3: "A", 6: "B", 7: "B", 8: "B", 11: "C", 12: "C", 13: "C" }[
    req.tipoComprobante
  ];
  const cond = Number(req.condicionIVAReceptorId);
  const valido = Boolean(CONDICION_IVA_RECEPTOR_TABLA[cond]);
  const paraClase = condicionIvaReceptorParaClase(cond, letra);
  const coherente = paraClase === cond;
  if (!valido || !coherente) errores++;
  console.log(
    `  ${cliente.razonSocial.padEnd(16)} -> ${empresa.condicionIVA.padEnd(11)} Factura ${letra}  CondIVA=${cond}  ${valido ? "válido" : "INVÁLIDO"}${coherente ? "" : " (incoherente con la clase)"}`,
  );
}

console.log(
  errores === 0
    ? "\nOK: todos los casos informan una Condición IVA del receptor válida y coherente."
    : `\nERROR: ${errores} caso(s) con problema.`,
);
process.exit(errores === 0 ? 0 : 1);