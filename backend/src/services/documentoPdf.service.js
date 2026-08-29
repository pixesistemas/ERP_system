const {
  getDocumentoById,
  updateDocumentoPDF,
} = require("../repositories/documentoComercial.repository");

const { getClienteById } = require("../repositories/cliente.repository");

const { getVendedorById } = require("../repositories/vendedor.repository");

const CommercialPDFService = require("../pdf/commercialPdf.service");

const eventBus = require("../events/eventBus");

const EVENTS = require("../events/events.constants");

/*
 * Genera el PDF de un documento comercial
 * previamente guardado en la base.
 */
async function generarPDFDocumento({ empresa, documentoId }) {
  const documento = getDocumentoById(documentoId);

  if (!documento) {
    const error = new Error("Documento comercial no encontrado");

    error.statusCode = 404;

    throw error;
  }

  /*
   * Evita que una empresa genere o consulte
   * documentos pertenecientes a otra empresa.
   */
  if (Number(documento.empresa_id) !== Number(empresa.id)) {
    const error = new Error("No autorizado");

    error.statusCode = 403;

    throw error;
  }

  const cliente = documento.cliente_id
    ? getClienteById(documento.cliente_id)
    : null;

  const vendedor = documento.vendedor_id
    ? getVendedorById(documento.vendedor_id)
    : null;

  /*
   * Envía al generador todos los datos guardados,
   * incluyendo condición de venta y descuento.
   */
  const pdf = await CommercialPDFService.generate({
    empresa,
    documento,
    cliente,
    vendedor,
  });

  /*
   * Construye la URL pública usando PUBLIC_BASE_URL
   * cuando la API se ejecuta detrás de un proxy.
   */
  const publicUrl = buildPublicUrl(pdf.url);

  /*
   * Guarda la ruta local y la URL pública.
   */
  const documentoActualizado = updateDocumentoPDF({
    documentoId: documento.id,

    empresaId: empresa.id,

    pdfPath: pdf.filePath,

    pdfUrl: publicUrl,
  });

  const pdfResult = {
    ...pdf,

    url: publicUrl,

    publicUrl,

    filename: pdf.filename || extractFilename(pdf.filePath),

    mimeType: pdf.mimeType || "application/pdf",
  };

  /*
   * Publica el evento para integraciones futuras,
   * auditoría y envío mediante WhatsApp.
   */
  eventBus.emitEvent(EVENTS.DOCUMENTO_PDF_GENERADO, {
    empresa,

    documento: documentoActualizado,

    pdf: pdfResult,
  });

  return {
    documento: documentoActualizado,

    pdf: pdfResult,
  };
}

/*
 * Construye una URL pública y evita
 * duplicar barras entre base y ruta.
 */
function buildPublicUrl(relativeUrl) {
  const url = String(relativeUrl || "").trim();

  if (!url) {
    return null;
  }

  /*
   * Conserva URLs que ya sean absolutas.
   */
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const baseUrl = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/g, "");

  if (!baseUrl) {
    return url;
  }

  const normalizedPath = url.startsWith("/") ? url : `/${url}`;

  return baseUrl + normalizedPath;
}

/*
 * Obtiene el nombre del archivo
 * desde una ruta local.
 */
function extractFilename(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");

  if (!normalized) {
    return null;
  }

  const parts = normalized.split("/");

  return parts[parts.length - 1] || null;
}

module.exports = {
  generarPDFDocumento,
};
