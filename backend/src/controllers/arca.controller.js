const { getEmpresaById } = require("../repositories/empresa.repository");
const {
  emitirComprobanteAfip,
  FiscalNetworkError,
} = require("../afip/fiscalEmission.service");
const { AFIPClient } = require("../afip");

/*
 * API ARCA para sistemas externos (ej. FoxPro).
 *
 * Usa el mismo certificado y punto de venta que el ERP, autenticado con
 * la API Key de la empresa (header x-api-key) y habilitado con el módulo
 * ARCA_API en el panel de superadmin.
 *
 * Endpoints:
 *   GET  /api/v1/arca/estado
 *   GET  /api/v1/arca/ultimo-comprobante?punto_venta=1&tipo=6
 *   POST /api/v1/arca/comprobantes
 */

function empresaDe(req) {
  return getEmpresaById(Number(req.empresa?.id));
}

function estado(req, res) {
  const empresa = empresaDe(req);
  if (!empresa) return res.status(404).json({ ok: false, error: "Empresa no encontrada." });
  res.json({
    ok: true,
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      cuit: empresa.cuit,
      condicionIVA: empresa.condicionIVA,
      production: empresa.production,
      puntoVenta: empresa.puntoVenta,
    },
    fiscal: {
      certificado: Boolean(empresa.cert && empresa.key),
      ambiente: empresa.production ? "PRODUCCION" : "HOMOLOGACION",
    },
  });
}

async function ultimoComprobante(req, res) {
  const empresa = empresaDe(req);
  const puntoVenta = Number(req.query.punto_venta || empresa?.puntoVenta || 1);
  const tipo = Number(req.query.tipo || 0);

  if (!tipo) {
    return res.status(400).json({
      ok: false,
      error: "Falta el parámetro tipo (código AFIP del comprobante, ej. 6 para Factura B).",
    });
  }

  try {
    const afip = AFIPClient.fromEmpresa(empresa);
    const ultimo = await afip.wsfe.getLastVoucher(puntoVenta, tipo);
    res.json({
      ok: true,
      punto_venta: puntoVenta,
      tipo,
      ultimo: Number(ultimo?.CbteNro || 0),
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: `No se pudo consultar ARCA: ${error.message}` });
  }
}

async function emitir(req, res) {
  const empresa = empresaDe(req);
  const d = req.body || {};

  const operacion = String(d.operacion || "FACTURA").toUpperCase();
  if (!["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"].includes(operacion)) {
    return res.status(400).json({
      ok: false,
      error: "operacion inválida: usá FACTURA, NOTA_CREDITO o NOTA_DEBITO.",
    });
  }

  const items = Array.isArray(d.items) ? d.items.filter((x) => Number(x.cantidad) > 0) : [];
  if (!items.length) {
    return res.status(400).json({ ok: false, error: "Faltan los items del comprobante." });
  }

  const cliente = d.cliente || {};
  const clienteFiscal = {
    cuit: String(cliente.cuit || "").replace(/\D/g, "") || null,
    dni: String(cliente.dni || "").replace(/\D/g, "") || null,
    razonSocial: String(cliente.razon_social || cliente.razonSocial || "CONSUMIDOR FINAL"),
    condicionIVA: String(
      cliente.condicion_iva || cliente.condicionIVA || "CONSUMIDOR FINAL",
    ).toUpperCase(),
  };
  if (!clienteFiscal.cuit && !clienteFiscal.dni) {
    clienteFiscal.condicionIVA = "CONSUMIDOR FINAL";
  }

  const cbteAsoc =
    Array.isArray(d.cbte_asoc) && d.cbte_asoc.length
      ? d.cbte_asoc.map((x) => ({
          tipo: Number(x.tipo),
          puntoVenta: Number(x.puntoVenta || x.punto_venta || 1),
          numero: Number(x.numero),
        }))
      : null;

  if ((operacion === "NOTA_CREDITO" || operacion === "NOTA_DEBITO") && !cbteAsoc) {
    return res.status(400).json({
      ok: false,
      error: "Las notas exigen cbte_asoc con el comprobante original.",
    });
  }

  const puntoVenta = Number(d.punto_venta || empresa?.puntoVenta || 1);

  try {
    const r = await emitirComprobanteAfip({
      empresaId: empresa.id,
      puntoVenta,
      clienteNombre: clienteFiscal.razonSocial,
      clienteFiscal,
      items,
      operacion,
      cbteAsoc,
    });

    res.json({
      ok: Boolean(r.ok),
      cae: r.cae || null,
      cae_vencimiento: r.vencimiento || null,
      numero: r.numero || null,
      punto_venta: puntoVenta,
      tipo_comprobante: r.tipoComprobante,
      letra: r.letra,
      nombre_comprobante: r.nombreComprobante,
      importe_neto: r.importeNeto,
      importe_iva: r.importeIva,
      importe_total: r.importeTotal,
      resultado: r.resultado || null,
      observaciones: r.observaciones || null,
      errores: r.errores || null,
    });
  } catch (error) {
    if (error instanceof FiscalNetworkError) {
      return res.status(503).json({ ok: false, error: error.message, estado: "PENDIENTE" });
    }
    res.status(422).json({ ok: false, error: error.message });
  }
}

module.exports = { estado, ultimoComprobante, emitir };
