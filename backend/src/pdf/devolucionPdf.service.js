const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const { urlPublica } = require("../utils/url");
const { empresaConPuntoVenta } = require("../repositories/puntoVenta.repository");

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(valor) {
  return Number(valor || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/*
 * PDF de devolución de productos de un pedido (documento no fiscal).
 * Se guarda en storage/pdf/<empresa>/devoluciones y se devuelve la URL
 * pública para verlo o imprimirlo desde el sistema.
 */
async function generarPdfDevolucion({ empresa, devolucion, items, documento }) {
  const emp = empresaConPuntoVenta(empresa, documento?.punto_venta);
  const filas = (items || [])
    .map(
      (x) => `
        <tr>
          <td>${escapar(x.codigo || "")}</td>
          <td>${escapar(x.descripcion || "")}</td>
          <td class="center">${Number(x.cantidad || 0).toLocaleString("es-AR")}</td>
          <td class="right">$ ${money(x.precio_unitario)}</td>
          <td class="center">${Number(x.iva || 0)}%</td>
          <td class="right">$ ${money(x.subtotal)}</td>
        </tr>`,
    )
    .join("");

  const total = (items || []).reduce((n, x) => n + Number(x.subtotal || 0), 0);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
  .header { border: 1px solid #000; padding: 10px; display: flex; justify-content: space-between; gap: 12px; }
  .titulo { text-align: center; font-size: 18px; font-weight: bold; margin: 14px 0 4px; }
  .subtitulo { text-align: center; font-size: 12px; margin-bottom: 14px; }
  .datos { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .box { border: 1px solid #000; padding: 8px; flex: 1; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 5px 6px; }
  th { background: #eee; text-align: left; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totales { margin-top: 12px; text-align: right; font-size: 13px; }
  .firma { margin-top: 60px; display: flex; justify-content: space-between; }
  .firma div { border-top: 1px solid #000; width: 45%; padding-top: 4px; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:16px;font-weight:bold">${escapar(emp.nombreFantasia || emp.nombre || "")}</div>
      <div>De: ${escapar(emp.razonSocial || emp.nombre || "")}</div>
      <div>${escapar(emp.direccion || "")}</div>
      <div>Mail: ${escapar(emp.email || "")} · Tel: ${escapar(emp.telefono || "")}${emp.whatsapp ? ` · Whatsapp ${escapar(emp.whatsapp)}` : ""}</div>
      <div>CUIT: ${escapar(emp.cuit || "")} · ${escapar(emp.condicionIVA || "")}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Fecha de devolución:</strong> ${escapar(devolucion.fecha_devolucion || "")}</div>
      <div><strong>Devolución N°:</strong> ${String(devolucion.id || 0).padStart(8, "0")}</div>
    </div>
  </div>

  <div class="titulo">DEVOLUCIÓN DE MERCADERÍA</div>
  <div class="subtitulo">Documento no fiscal</div>

  <div class="datos">
    <div class="box">
      <strong>Cliente:</strong> ${escapar(devolucion.cliente_nombre || "CONSUMIDOR FINAL")}<br/>
      <strong>Pedido origen:</strong> ${escapar(documento?.tipo || "")} ${String(documento?.punto_venta || "").padStart(4, "0")}-${String(documento?.numero || "").padStart(8, "0")}<br/>
      <strong>Motivo:</strong> ${escapar(devolucion.motivo || "Sin especificar")}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Producto</th>
        <th class="center">Cant.</th>
        <th class="right">Precio unit.</th>
        <th class="center">IVA</th>
        <th class="right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filas || '<tr><td colspan="6" class="center">Sin ítems</td></tr>'}</tbody>
  </table>

  <div class="totales"><strong>Total devolución: $ ${money(total)}</strong></div>

  <div class="firma">
    <div>Entregó conforme</div>
    <div>Recibió conforme</div>
  </div>
</body>
</html>`;

  const directory = path.join(
    process.cwd(),
    "storage",
    "pdf",
    empresa.nombre,
    "devoluciones",
  );
  fs.mkdirSync(directory, { recursive: true });

  const fileName = `DEVOLUCION-${String(devolucion.id || Date.now()).padStart(8, "0")}.pdf`;
  const filePath = path.join(directory, fileName);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await browser.close();
  }

  return {
    fileName,
    filePath,
    url: `/storage/pdf/${empresa.nombre}/devoluciones/${fileName}`,
    publicUrl: urlPublica(`/storage/pdf/${empresa.nombre}/devoluciones/${fileName}`),
  };
}

module.exports = { generarPdfDevolucion };
