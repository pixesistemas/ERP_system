const db = require("../db/database");
const { crearCobro, generarImagenQR } = require("../services/paymentGateway.service");
const linkRepo = require("../repositories/paymentLink.repository");

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/*
 * Crea un cobro (link + QR de MercadoPago) para un monto/documento.
 * Se llama por API o desde el asistente.
 */
async function crearLink(req, res) {
  try {
    const empresaId = req.empresa?.id || req.body.empresaId;
    if (!empresaId) {
      return res.status(400).json({ ok: false, error: "empresaId requerido" });
    }
    const { clienteId, documentoId, importe, proveedor = "MERCADOPAGO" } =
      req.body;
    const monto = numberOrNull(importe);
    if (!monto || monto <= 0) {
      return res.status(400).json({ ok: false, error: "importe inválido" });
    }
    const cobro = await crearCobro({
      empresaId,
      cliente: { id: clienteId },
      importe: monto,
      documentoRef: documentoId,
      proveedor,
    });
    const imagen = await generarImagenQR(
      cobro.qrData,
      empresaId,
      documentoId,
    );
    const link = linkRepo.guardarLink({
      empresaId,
      clienteId: clienteId || null,
      documentoId: documentoId || null,
      proveedor: cobro.proveedor,
      importe: monto,
      url: cobro.url,
      qrData: cobro.qrData,
      externalId: cobro.externalId,
      estado: "PENDIENTE",
    });
    return res.json({
      ok: true,
      link,
      qr: { url: imagen.url, mimeType: imagen.mimeType },
      mock: Boolean(cobro.mock),
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}

/*
 * Lista los links de cobro de una empresa (PENDIENTE / PAGADO).
 */
function listarLinks(req, res) {
  const empresaId = req.empresa?.id || req.query.empresaId;
  if (!empresaId) {
    return res.status(400).json({ ok: false, error: "empresaId requerido" });
  }
  const estado = req.query.estado || null;
  const rows = estado
    ? db
        .prepare(
          "SELECT * FROM links_pago WHERE empresa_id=? AND estado=? ORDER BY id DESC",
        )
        .all(empresaId, estado)
    : db
        .prepare("SELECT * FROM links_pago WHERE empresa_id=? ORDER BY id DESC")
        .all(empresaId);
  return res.json({ ok: true, links: rows });
}

/*
 * Configura una pasarela de pago por empresa.
 */
function configurarPasarela(req, res) {
  const empresaId = req.empresa?.id || req.body.empresaId;
  if (!empresaId) {
    return res.status(400).json({ ok: false, error: "empresaId requerido" });
  }
  const {
    proveedor = "MERCADOPAGO",
    nombre,
    activo,
    credenciales,
    config,
  } = req.body;
  const pasarela = linkRepo.guardarPasarela({
    empresaId,
    proveedor,
    nombre,
    activo,
    credenciales,
    config,
  });
  return res.json({ ok: true, pasarela });
}

/*
 * Webhook de MercadoPago: confirma el pago de un link/cobro.
 * Público (sin JWT) porque lo invoca la plataforma.
 */
async function webhookMercadoPago(req, res) {
  try {
    const body = req.body || {};
    const externalId =
      body.external_reference ||
      (body.data && body.data.external_reference) ||
      null;
    const empresaId = req.query.empresaId || body.empresa_id || null;
    if (!externalId || !empresaId) {
      return res.status(400).json({ ok: false, error: "external_reference y empresaId requeridos" });
    }
    linkRepo.marcarPagado({ empresaId, externalId, webhookRaw: body });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

module.exports = { crearLink, listarLinks, configurarPasarela, webhookMercadoPago };
