const puppeteer = require("puppeteer");
const companySettings = require("../repositories/companySettings.repository");
const db = require("../db/database");

const {
  crearRecibo,
  getReciboById,
  listarRecibos,
  confirmarRecibo,
} = require("../repositories/recibo.repository");

function crear(req, res, next) {
  try {
    const recibo = crearRecibo({
      empresaId: req.empresa.id,
      clienteId: req.body.clienteId || null,
      clienteDoc: req.body.clienteDoc,
      clienteNombre: req.body.clienteNombre,
      detalles: req.body.detalles || [],
      observaciones: req.body.observaciones || null,
      usuarioId: req.usuario?.id || null,
      puntoVenta: req.body.puntoVenta || 1,
    });

    res.json({ ok: true, recibo });
  } catch (error) {
    next(error);
  }
}

function listar(req, res, next) {
  try {
    const recibos = listarRecibos({ empresaId: req.empresa.id }).map((row) => getReciboById(row.id));
    res.json({ ok: true, total: recibos.length, recibos });
  } catch (error) {
    next(error);
  }
}

function obtener(req, res, next) {
  try {
    const recibo = getReciboById(req.params.id);

    if (!recibo) {
      return res.status(404).json({ ok: false, error: "Recibo no encontrado" });
    }

    if (recibo.empresa_id !== req.empresa.id) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    res.json({ ok: true, recibo });
  } catch (error) {
    next(error);
  }
}

function confirmar(req, res, next) {
  try {
    const recibo = confirmarRecibo({
      reciboId: req.params.id,
      empresaId: req.empresa.id,
    });

    if (!recibo) {
      return res.status(404).json({ ok: false, error: "Recibo no encontrado" });
    }

    res.json({ ok: true, recibo });
  } catch (error) {
    next(error);
  }
}

async function pdf(req, res, next) {
  let browser;
  try {
    const recibo = getReciboById(req.params.id);
    if (!recibo) return res.status(404).json({ ok: false, error: "Recibo no encontrado" });
    if (recibo.empresa_id !== req.empresa.id) return res.status(403).json({ ok: false, error: "No autorizado" });
    const settings = companySettings.getSettings(req.empresa.id);
    const medios = (recibo.detalles || []).map(d => `<tr><td>${d.medio_pago}</td><td style="text-align:right">$ ${Number(d.importe||0).toLocaleString("es-AR",{minimumFractionDigits:2})}</td></tr>`).join("");
    const pvLogo = db.prepare("SELECT logo FROM puntos_venta WHERE empresa_id=? AND numero=? AND logo IS NOT NULL").get(req.empresa.id, Number(recibo.punto_venta))?.logo || "";
    const logo = (pvLogo && pvLogo.startsWith("data:image/") ? pvLogo : settings.logoUrl) ? `<img class="logo" src="${pvLogo && pvLogo.startsWith("data:image/") ? pvLogo : settings.logoUrl}" alt="Logo">` : "";
    const copy = (label) => `<section class="copy"><div class="head"><div class="brand">${logo}<div><h1>RECIBO DE COBRO</h1><p>${req.empresa.nombre || "Empresa"}</p></div></div><div class="number"><b>${String(recibo.punto_venta).padStart(4,"0")}-${String(recibo.numero).padStart(8,"0")}</b><p>${new Date(recibo.created_at).toLocaleString("es-AR")}</p><strong>${label}</strong></div></div><div class="customer"><b>Cliente:</b> ${recibo.cliente_nombre} &nbsp; · &nbsp; <b>Documento:</b> ${recibo.cliente_doc}</div><table><thead><tr><th>Medio de pago</th><th>Importe</th></tr></thead><tbody>${medios}</tbody></table><div class="total">Total recibido: $ ${Number(recibo.importe_total).toLocaleString("es-AR",{minimumFractionDigits:2})}</div><div class="obs"><b>Observaciones:</b> ${recibo.observaciones || "-"}</div><div class="footer"><span>Firma y aclaración</span><span>Recibí conforme</span></div></section>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#111827}.copy{height:132mm;padding:8mm 11mm;position:relative}.copy+ .copy{border-top:2px dashed #64748b}.head{display:flex;justify-content:space-between;border-bottom:1.5px solid #111827;padding-bottom:7px}.brand{display:flex;gap:10px;align-items:center}.logo{max-width:60px;max-height:42px}.head h1{font-size:21px;margin:0}.head p,.number p{font-size:11px;margin:4px 0}.number{text-align:right;font-size:12px}.number strong{display:inline-block;margin-top:3px;border:1px solid #94a3b8;padding:2px 8px;border-radius:12px}.customer{border:1px solid #cbd5e1;border-radius:7px;padding:9px;margin-top:10px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{padding:6px;border-bottom:1px solid #e5e7eb;text-align:left}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:9px}.obs{font-size:11px;margin-top:8px}.footer{position:absolute;bottom:11mm;left:11mm;right:11mm;display:flex;justify-content:space-between}.footer span{border-top:1px solid #111;width:180px;text-align:center;padding-top:4px;font-size:11px}</style></head><body>${copy("ORIGINAL")}${settings.reciboDobleCopia ? copy("COPIA") : ""}</body></html>`;
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage(); await page.setContent(html, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=recibo-${String(recibo.punto_venta).padStart(4,"0")}-${String(recibo.numero).padStart(8,"0")}.pdf`);
    res.end(buffer);
  } catch (error) { next(error); } finally { if (browser) await browser.close(); }
}

module.exports = {
  crear,
  listar,
  obtener,
  confirmar,
  pdf,
};
