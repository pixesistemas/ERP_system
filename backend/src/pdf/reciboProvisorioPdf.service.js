const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const { urlPublica } = require("../utils/url");

/*
 * Recibo PROVISORIO del dinero declarado en el pedido (todavía sin
 * confirmar por la oficina). Sirve para entregarle al cliente en el
 * momento o compartirlo por WhatsApp. No reemplaza al recibo oficial.
 */

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtMon(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function descripcionCobro(c) {
  if (c.medio === "CHEQUE") {
    return `Cheque ${c.cheque_numero || "s/n"}${c.banco ? ` · ${c.banco}` : ""}${c.cheque_librador ? ` · ${c.cheque_librador}` : ""}${c.cheque_vencimiento ? ` · vence ${c.cheque_vencimiento}` : ""}`;
  }
  if (c.medio === "TRANSFERENCIA" && c.banco) return `Transferencia · ${c.banco}`;
  return c.medio;
}

async function generarPdfReciboProvisorio({ empresa, venta, cobros }) {
  const total = cobros.reduce((n, c) => n + Number(c.importe || 0), 0);
  const fecha = new Date().toLocaleString("es-AR");
  const filas = cobros
    .map(
      (c) => `<tr><td>${escapar(descripcionCobro(c))}</td><td class="num">$ ${fmtMon(c.importe)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 12.5px; }
  .marca { border: 2px dashed #b3541e; color: #b3541e; text-align: center; font-weight: bold; letter-spacing: 2px; padding: 5px; border-radius: 8px; font-size: 13px; }
  h1 { font-size: 19px; margin: 14px 0 2px; color: #3a3170; }
  .sub { color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #bbb; padding: 7px 9px; text-align: left; }
  th { background: #2E3A59; color: #fff; }
  .num { text-align: right; white-space: nowrap; }
  .total { margin-top: 10px; text-align: right; font-size: 18px; }
  .nota { margin-top: 16px; background: #FFF8E6; border: 1px solid #F0C36D; border-radius: 8px; padding: 8px 12px; font-size: 11.5px; }
  .pie { margin-top: 22px; color: #777; font-size: 11px; display: flex; justify-content: space-between; }
</style></head>
<body>
  <div class="marca">RECIBO PROVISORIO · PENDIENTE DE CONFIRMACIÓN</div>
  <h1>${escapar(empresa?.razon_social || empresa?.nombre || "")}</h1>
  <div class="sub">${escapar(empresa?.direccion || "")} · CUIT ${escapar(empresa?.cuit || "")} · ${fecha}</div>
  <p><strong>Cliente:</strong> ${escapar(venta.cliente || "CONSUMIDOR FINAL")}
     ${venta.cuit || venta.dni ? `· Doc: ${escapar(venta.cuit || venta.dni)}` : ""}
     ${venta.domicilio ? `<br/><strong>Domicilio:</strong> ${escapar(venta.domicilio)} ${escapar(venta.localidad || "")}` : ""}</p>
  <p><strong>Concepto:</strong> cobro a cuenta del pedido ${String(venta.punto_venta || 1).padStart(4, "0")}-${String(venta.numero || 0).padStart(8, "0")}</p>
  <table>
    <thead><tr><th>Medio de pago</th><th class="num">Importe</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="total">TOTAL ENTREGADO: <strong>$ ${fmtMon(total)}</strong></div>
  <div class="nota">
    Este comprobante es <strong>provisorio</strong>: acredita el dinero recibido por el vendedor/repartidor y queda pendiente de
    confirmación por la oficina. Una vez confirmado se emite el <strong>recibo oficial</strong> con el movimiento de cuenta corriente.
  </div>
  <div class="pie">
    <span>Firma del cliente: ______________________</span>
    <span>Firma del vendedor/repartidor: ______________________</span>
  </div>
</body></html>`;

  const directory = path.join(process.cwd(), "storage", "pdf", String(empresa?.nombre || "general"), "provisorios");
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `RECIBO-PROVISORIO-${String(venta.punto_venta || 1).padStart(4, "0")}-${String(venta.numero || 0).padStart(8, "0")}-${Date.now()}.pdf`;
  const filePath = path.join(directory, fileName);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: filePath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  } finally {
    await browser.close();
  }

  const url = `/storage/pdf/${empresa?.nombre || "general"}/provisorios/${fileName}`;
  return { fileName, filePath, url, publicUrl: urlPublica(url) };
}

module.exports = { generarPdfReciboProvisorio };
