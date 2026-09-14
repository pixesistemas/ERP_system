const fs = require("fs");
const path = require("path");
const db = require("../db/database");
const { todayLocal } = require("../utils/time");
const { emitirComprobanteAfip, FiscalNetworkError } = require("../afip/fiscalEmission.service");
const linkRepo = require("../repositories/paymentLink.repository");
const notificacion = require("./notificacion.service");

/*
 * Automatizaciones configurables por empresa. Cada función respeta el flag
 * `auto_*` de empresa_configuraciones: si está apagado, devuelve skipped.
 * n8n se encarga del cron; el ERP sólo expone estas acciones.
 */

function getConfig(empresaId) {
  const row = db.prepare("SELECT * FROM empresa_configuraciones WHERE empresa_id=?").get(empresaId) || {};
  return {
    reporteDiario: Boolean(row.auto_reporte_diario),
    reporteHora: row.auto_reporte_hora || "21:00",
    reporteEmail: row.auto_reporte_email || "",
    stockMinimo: Boolean(row.auto_stock_minimo),
    stockTelefono: row.auto_stock_telefono || "",
    reintentoCae: Boolean(row.auto_reintento_cae),
    cobranzas: Boolean(row.auto_cobranzas),
    cobranzasDias: Number(row.auto_cobranzas_dias || 7),
    cobranzasHora: row.auto_cobranzas_hora || "10:00",
    backup: Boolean(row.auto_backup),
    backupHora: row.auto_backup_hora || "03:00",
    avisarReparto: Boolean(row.auto_avisar_reparto),
    escalarHumano: Boolean(row.auto_escalar_humano),
    escalarTelefono: row.auto_escalar_telefono || "",
  };
}

function reporteDiario(empresaId) {
  const hoy = todayLocal();
  const ventas = db
    .prepare(
      `SELECT COUNT(*) cantidad, COALESCE(SUM(total),0) total
       FROM ventas_pos WHERE empresa_id=? AND substr(fecha,1,10)=? AND estado='CONFIRMADA'`,
    )
    .get(empresaId, hoy);
  const porTipo = db
    .prepare(
      `SELECT tipo, COUNT(*) cantidad, COALESCE(SUM(total),0) total
       FROM ventas_pos WHERE empresa_id=? AND substr(fecha,1,10)=? AND estado='CONFIRMADA'
       GROUP BY tipo ORDER BY total DESC`,
    )
    .all(empresaId, hoy);
  let caja = { cantidad: 0, total: 0 };
  try {
    caja = db
      .prepare(
        `SELECT COUNT(*) cantidad, COALESCE(SUM(importe),0) total
         FROM caja_movimientos WHERE empresa_id=? AND substr(created_at,1,10)=?`,
      )
      .get(empresaId, hoy);
  } catch (e) {}
  const stockBajo = db
    .prepare(
      `SELECT COUNT(*) n FROM stock_productos WHERE empresa_id=? AND stock_minimo>0 AND cantidad<=stock_minimo`,
    )
    .get(empresaId).n;
  const topProductos = db
    .prepare(
      `SELECT i.codigo, i.descripcion, SUM(i.cantidad) cantidad, SUM(i.subtotal) importe
       FROM venta_pos_items i JOIN ventas_pos v ON v.id=i.venta_id
       WHERE v.empresa_id=? AND substr(v.fecha,1,10)=? AND v.estado='CONFIRMADA'
       GROUP BY i.codigo ORDER BY importe DESC LIMIT 10`,
    )
    .all(empresaId, hoy);
  return { fecha: hoy, ventas, porTipo, caja, stockBajo, topProductos };
}

async function enviarReporteDiario(empresaId) {
  const cfg = getConfig(empresaId);
  if (!cfg.reporteDiario) return { skipped: true, motivo: "Reporte diario desactivado" };
  const r = reporteDiario(empresaId);
  const empresa = db.prepare("SELECT nombre FROM empresas WHERE id=?").get(empresaId);
  const filas = r.topProductos
    .map(
      (p) =>
        `<tr><td>${p.codigo}</td><td>${p.descripcion}</td><td align="right">${Number(p.cantidad)}</td><td align="right">$ ${Number(p.importe).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>`,
    )
    .join("");
  const html = `
    <h2>Resumen del ${r.fecha} — ${empresa?.nombre || ""}</h2>
    <p><b>Ventas:</b> ${r.ventas.cantidad} · <b>Total:</b> $ ${Number(r.ventas.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
    <p><b>Caja:</b> $ ${Number(r.caja.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
    <p><b>Productos con stock bajo:</b> ${r.stockBajo}</p>
    <h3>Top productos</h3>
    <table border="1" cellpadding="6" style="border-collapse:collapse"><thead><tr><th>Código</th><th>Producto</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>${filas}</tbody></table>`;
  const envio = await notificacion.enviarEmail({
    to: cfg.reporteEmail,
    subject: `Reporte diario ${r.fecha} — ${empresa?.nombre || ""}`,
    html,
    text: `Ventas: ${r.ventas.cantidad} por $ ${r.ventas.total}. Stock bajo: ${r.stockBajo}.`,
  });
  return { ok: true, enviadoA: cfg.reporteEmail || null, email: envio, reporte: r };
}

function stockMinimo(empresaId) {
  return db
    .prepare(
      `SELECT p.codigo, p.descripcion, sp.cantidad, sp.stock_minimo,
              CASE WHEN sp.stock_minimo > sp.cantidad THEN sp.stock_minimo - sp.cantidad ELSE 0 END sugerido
       FROM stock_productos sp JOIN productos p ON p.id = sp.producto_id
       WHERE sp.empresa_id=? AND sp.stock_minimo > 0 AND sp.cantidad <= sp.stock_minimo
       ORDER BY (sp.stock_minimo - sp.cantidad) DESC, p.descripcion
       LIMIT 500`,
    )
    .all(empresaId);
}

async function alertarStockMinimo(empresaId) {
  const cfg = getConfig(empresaId);
  if (!cfg.stockMinimo) return { skipped: true, motivo: "Alertas de stock desactivadas" };
  const items = stockMinimo(empresaId);
  if (!items.length) return { ok: true, items: [], enviado: false };
  const texto =
    `📦 Stock bajo (${items.length}):\n` +
    items
      .slice(0, 20)
      .map((i) => `• ${i.codigo} ${i.descripcion}: ${Number(i.cantidad)} (mín ${Number(i.stock_minimo)}, reponer ${Number(i.sugerido)})`)
      .join("\n");
  const destino = cfg.stockTelefono;
  const envio = destino ? await notificacion.enviarWhatsappEmpresa({ empresaId, telefono: destino, mensaje: texto }) : { ok: false, motivo: "Sin teléfono" };
  return { ok: true, items, enviado: envio.ok, envio };
}

async function reintentarCae(empresaId) {
  const cfg = getConfig(empresaId);
  if (!cfg.reintentoCae) return { skipped: true, motivo: "Reintento de CAE desactivado" };
  const pendientes = db
    .prepare(
      `SELECT v.id venta_id, v.punto_venta, v.cliente_id, d.id documento_id, d.numero
       FROM ventas_pos v JOIN documentos_comerciales d ON d.id = v.documento_id
       WHERE v.empresa_id=? AND v.tipo='FACTURA' AND d.cae IS NULL AND d.afip_estado='PENDIENTE'
       ORDER BY v.id LIMIT 50`,
    )
    .all(empresaId);
  const resultados = [];
  for (const p of pendientes) {
    const items = db.prepare("SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id").all(p.venta_id);
    const client = db.prepare("SELECT razon_social FROM clientes WHERE id=? AND empresa_id=?").get(p.cliente_id, empresaId);
    try {
      const fiscal = await emitirComprobanteAfip({
        empresaId,
        puntoVenta: p.punto_venta,
        clienteId: p.cliente_id,
        clienteNombre: client?.razon_social || "CONSUMIDOR FINAL",
        items,
        operacion: "FACTURA",
        ventaId: p.venta_id,
        documentoId: p.documento_id,
      });
      resultados.push({ ventaId: p.venta_id, ok: fiscal?.ok !== false, cae: fiscal?.cae || null });
    } catch (error) {
      if (error instanceof FiscalNetworkError) resultados.push({ ventaId: p.venta_id, ok: false, pendiente: true });
      else resultados.push({ ventaId: p.venta_id, ok: false, error: error.message });
    }
  }
  return { ok: true, pendientes: pendientes.length, resultados };
}

function cobranzas(empresaId, dias = 0) {
  const minDias = Number(dias) > 0 ? Number(dias) : 0;
  const rows = db
    .prepare(
      `SELECT m.cliente_doc, MAX(m.cliente_id) cliente_id, MAX(m.cliente_nombre) nombre,
              SUM(m.debe) - SUM(m.haber) saldo,
              MAX(m.created_at) ultimo_movimiento
       FROM cliente_cc_movimientos m
       WHERE m.empresa_id=?
       GROUP BY m.cliente_doc
       HAVING saldo > 0.009
         AND (? = 0 OR (julianday('now') - julianday(MAX(m.created_at))) >= ?)
       ORDER BY saldo DESC LIMIT 200`,
    )
    .all(empresaId, minDias, minDias);
  const buscarTel = db.prepare(
    `SELECT id, razon_social, telefono FROM clientes
     WHERE empresa_id=? AND (cuit=? OR dni=? OR CAST(id AS TEXT)=?) LIMIT 1`,
  );
  return rows.map((r) => {
    const c = buscarTel.get(empresaId, r.cliente_doc, r.cliente_doc, r.cliente_doc) || {};
    return { ...r, cliente_id: c.id || r.cliente_id || null, nombre: c.razon_social || r.nombre, telefono: c.telefono || "" };
  });
}

async function enviarCobranzas(empresaId) {
  const cfg = getConfig(empresaId);
  if (!cfg.cobranzas) return { skipped: true, motivo: "Cobranzas desactivadas" };
  const deudores = cobranzas(empresaId, cfg.cobranzasDias);
  const enviados = [];
  for (const d of deudores.slice(0, 50)) {
    if (!d.telefono) continue;
    const texto = `Hola ${d.nombre || ""}, te recordamos que tenés un saldo pendiente de $ ${Number(d.saldo).toLocaleString("es-AR", { minimumFractionDigits: 2 })}. Podés coordinar el pago respondiendo este mensaje. ¡Gracias!`;
    const envio = await notificacion.enviarWhatsappEmpresa({ empresaId, telefono: d.telefono, mensaje: texto });
    enviados.push({ cliente: d.nombre, telefono: d.telefono, saldo: d.saldo, ok: envio.ok });
  }
  return { ok: true, deudores: deudores.length, enviados };
}

async function conciliarPago({ empresaId, externalId }) {
  if (!empresaId || !externalId) return { ok: false, motivo: "empresaId y externalId requeridos" };
  const link = db.prepare("SELECT * FROM links_pago WHERE empresa_id=? AND external_id=?").get(empresaId, externalId);
  if (!link) return { ok: false, motivo: "Link de pago no encontrado" };
  const r = linkRepo.marcarPagado({ empresaId, externalId, webhookRaw: { origen: "conciliacion" } });
  const empresa = db.prepare("SELECT nombre FROM empresas WHERE id=?").get(empresaId);
  const mensaje =
    `✅ Pago acreditado\n${empresa?.nombre || ""}\n` +
    `Importe: $ ${Number(link?.importe || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` +
    (link?.documento_id ? `\nDocumento #${link.documento_id}` : "");
  const cfg = getConfig(empresaId);
  if (cfg.stockTelefono) await notificacion.enviarWhatsappEmpresa({ empresaId, telefono: cfg.stockTelefono, mensaje });
  return { ok: true, actualizados: r.changes, link };
}

async function crearBackup() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/afip_api.db");
  if (!fs.existsSync(dbPath)) return { ok: false, motivo: "No existe la base" };
  const dir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destino = path.join(dir, `afip_api-${stamp}.db`);
  await db.backup(destino);
  const size = fs.statSync(destino).size;
  return { ok: true, archivo: path.basename(destino), tamano: size };
}

function backupMasReciente() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/afip_api.db");
  const dir = path.join(path.dirname(dbPath), "backups");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

async function avisarReparto(empresaId, documentoId, estado) {
  const cfg = getConfig(empresaId);
  if (!cfg.avisarReparto) return { skipped: true, motivo: "Aviso de reparto desactivado" };
  const doc = db.prepare("SELECT * FROM documentos_comerciales WHERE id=? AND empresa_id=?").get(documentoId, empresaId);
  if (!doc || !doc.telefono_origen) return { ok: false, motivo: "Sin teléfono de origen" };
  const textos = {
    PREPARANDO: "¡Lo tenemos en preparación! En breve te avisamos.",
    LISTO: "¡Está listo! Podés pasar a retirarlo cuando quieras.",
    EN_CAMINO: "¡Salió para entrega! Ya va en camino 🚚",
    ENTREGADO: "¡Entregado! Gracias por tu compra, nos vemos 👋",
  };
  const mensaje = textos[String(estado || "").toUpperCase()] || `Tu pedido cambió de estado: ${estado}.`;
  return notificacion.enviarWhatsappEmpresa({ empresaId, telefono: doc.telefono_origen, mensaje });
}

async function escalar(empresaId, { telefono, mensaje }) {
  const cfg = getConfig(empresaId);
  if (!cfg.escalarHumano) return { skipped: true, motivo: "Escalamiento desactivado" };
  const destino = cfg.escalarTelefono || telefono;
  const n8nUrl = process.env.N8N_ESCALAMIENTO_WEBHOOK_URL;
  if (n8nUrl) {
    try {
      const resp = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "" },
        body: JSON.stringify({ evento: "escalamiento.humano", empresaId, telefono, mensaje, destino }),
      });
      if (resp.ok) return { ok: true, via: "n8n" };
    } catch (e) {}
  }
  if (!destino) return { ok: false, motivo: "Sin teléfono de escalamiento" };
  return notificacion.enviarWhatsappEmpresa({
    empresaId,
    telefono: destino,
    mensaje: `🙋 Un cliente necesita atención humana.\nTel: ${telefono || "-"}\n${String(mensaje || "").slice(0, 500)}`,
  });
}

module.exports = {
  getConfig,
  reporteDiario,
  enviarReporteDiario,
  stockMinimo,
  alertarStockMinimo,
  reintentarCae,
  cobranzas,
  enviarCobranzas,
  conciliarPago,
  crearBackup,
  backupMasReciente,
  avisarReparto,
  escalar,
};
