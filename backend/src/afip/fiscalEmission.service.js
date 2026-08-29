const db = require("../db/database");
const { getEmpresaById } = require("../repositories/empresa.repository");
const { getClienteById } = require("../repositories/cliente.repository");
const { AFIPClient } = require("./index");
const { buildInvoiceRequest } = require("./invoiceBuilder");
const {
  getLetraComprobante,
  getNombreComprobante,
} = require("./fiscal.constants");

/*
 * FiscalEmissionService
 *
 * Emite comprobantes (factura, nota de crédito o nota de débito) contra
 * WSFE/ARCA desde cualquier canal (POS, asistente, WhatsApp) y registra
 * cada intento en la tabla fiscal_intentos con su resultado.
 *
 * - Errores de red (ARCA no responde): lanzan `FiscalNetworkError`.
 * - Rechazos de ARCA (comprobante inválido): devuelven `{ ok:false, ... }`.
 * - Errores de configuración o internos: lanzan Error común.
 */
class FiscalNetworkError extends Error {
  constructor(message, original) {
    super(message);
    this.name = "FiscalNetworkError";
    this.cause = original;
  }
}

function esErrorDeRed(error) {
  const code = String(error?.code || error?.errno || "");
  const message = String(error?.message || error?.reason || "").toLowerCase();

  return (
    ["ETIMEDOUT", "ECONNREFUSED", "ESOCKETTIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(code) ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connect") ||
    message.includes("socket") ||
    message.includes("getaddrinfo") ||
    message.includes("network is unreachable") ||
    message.includes("unreachable")
  );
}

function registrarIntento({
  empresaId,
  ventaId,
  documentoId,
  operacion,
  estado,
  intento,
  tipoComprobante,
  letra,
  numero,
  cae,
  caeVencimiento,
  error,
  respuesta,
}) {
  const info = db
    .prepare(
      `INSERT INTO fiscal_intentos(
         empresa_id, venta_id, documento_id, operacion, estado, intento,
         tipo_comprobante, letra, numero, cae, cae_vencimiento, error, respuesta_json
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      empresaId,
      ventaId || null,
      documentoId || null,
      operacion,
      estado,
      intento,
      tipoComprobante || null,
      letra || null,
      numero || null,
      cae || null,
      caeVencimiento || null,
      error || null,
      respuesta ? JSON.stringify(respuesta) : null,
    );
  return Number(info.lastInsertRowid);
}

function proximoIntento({ ventaId, documentoId }) {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(intento),0)+1 n FROM fiscal_intentos WHERE (venta_id=? OR documento_id=?)",
    )
    .get(ventaId || null, documentoId || null);
  return Number(row?.n || 1);
}

/*
 * Arma el request con invoiceBuilder (reutilizando la resolución A/B/C),
 * llama a WSFE y registra el intento. No toca la base comercial salvo
 * fiscal_intentos: la operación la persiste el llamador.
 */
async function emitirComprobanteAfip({
  empresaId,
  puntoVenta,
  clienteId,
  clienteNombre,
  items,
  operacion = "FACTURA",
  cbteAsoc = null,
  ventaId = null,
  documentoId = null,
}) {
  const empresa = getEmpresaById(empresaId);

  if (!empresa) {
    throw new Error("No se encontró la configuración fiscal de la empresa.");
  }
  if (!empresa.cuit || !empresa.cert || !empresa.key) {
    throw new Error(
      "Faltan datos fiscales de la empresa (CUIT, certificado o clave). Completalos en Empresa → Datos fiscales y ARCA antes de facturar.",
    );
  }

  const cliente = clienteId ? getClienteById(clienteId) : null;

  const clienteFiscal = cliente
    ? {
        cuit: cliente.cuit || null,
        dni: cliente.dni || null,
        razonSocial: cliente.razonSocial || clienteNombre || "CONSUMIDOR FINAL",
        condicionIVA: cliente.condicionIVA || "CF",
      }
    : {
        cuit: null,
        dni: null,
        razonSocial: clienteNombre || "CONSUMIDOR FINAL",
        condicionIVA: "CF",
      };

  const itemsFiscales = items.map((x) => ({
    codigo: x.codigo || "",
    descripcion: x.descripcion || "",
    cantidad: Number(x.cantidad || 0),
    precioUnitario: Number(x.precio_unitario || x.precio || 0),
    descuento: Number(x.descuento || 0),
    iva: Number(x.iva || 21),
  }));

  const facturaPreparada = buildInvoiceRequest(
    {
      empresa: empresa.nombre,
      operacion,
      puntoVenta,
      cliente: clienteFiscal,
      items: itemsFiscales,
    },
    empresa,
  );

  if (cbteAsoc && cbteAsoc.length) {
    facturaPreparada.cbteAsoc = cbteAsoc;
  }

  const intento = proximoIntento({ ventaId, documentoId });
  const afip = AFIPClient.fromEmpresa(empresa);

  let result;
  try {
    result = await afip.wsfe.createInvoice(facturaPreparada);
  } catch (error) {
    const estado = esErrorDeRed(error) ? "ERROR_RED" : "ERROR";
    const intentoId = registrarIntento({
      empresaId,
      ventaId,
      documentoId,
      operacion,
      estado,
      intento,
      tipoComprobante: facturaPreparada.tipoComprobante,
      letra: getLetraComprobante(facturaPreparada.tipoComprobante),
      error: String(error?.message || error),
      respuesta: { code: error?.code, reason: error?.reason },
    });
    if (esErrorDeRed(error)) {
      const networkError = new FiscalNetworkError(
        "ARCA no respondió. La operación se guardó como PENDIENTE de CAE: reintentala más tarde desde el historial de ventas.",
        error,
      );
      networkError.intentoId = intentoId;
      throw networkError;
    }
    throw error;
  }

  const intentoId = registrarIntento({
    empresaId,
    ventaId,
    documentoId,
    operacion,
    estado: result.ok ? "AUTORIZADO" : "RECHAZADO",
    intento,
    tipoComprobante: facturaPreparada.tipoComprobante,
    letra: getLetraComprobante(facturaPreparada.tipoComprobante),
    numero: result.ok ? result.numero : null,
    cae: result.ok ? result.cae : null,
    caeVencimiento: result.ok ? result.vencimiento : null,
    error: result.ok ? null : JSON.stringify(result.errores || result.observaciones || null),
    respuesta: result.raw,
  });

  return {
    ...result,
    intentoId,
    tipoComprobante: facturaPreparada.tipoComprobante,
    letra: getLetraComprobante(facturaPreparada.tipoComprobante),
    nombreComprobante: getNombreComprobante(facturaPreparada.tipoComprobante),
    importeNeto: facturaPreparada.importeNeto,
    importeIva: facturaPreparada.importeIva,
    importeTotal: facturaPreparada.importeTotal,
  };
}

module.exports = {
  emitirComprobanteAfip,
  registrarIntento,
  esErrorDeRed,
  FiscalNetworkError,
};
