const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const { urlPublica } = require("../utils/url");

/*
 * PDF de pedidos pendientes: una hoja A4 por pedido, con los datos del
 * cliente, vendedor, canal, fecha y la grilla de productos.
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

function fmtFecha(v) {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function hojaPedido(pedido, empresa) {
  const items = (pedido.items || [])
    .map(
      (i) => `
      <tr>
        <td class="cod">${escapar(i.codigo || "")}</td>
        <td>${escapar(i.descripcion || "")}</td>
        <td class="num">${Number(i.cantidad || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 })}</td>
        <td class="num">$ ${fmtMon(i.precio_unitario)}</td>
        <td class="num box"></td>
      </tr>`,
    )
    .join("");
  return `
  <section class="hoja">
    <header>
      <div>
        <h1>Pedido #${String(pedido.numero || 0).padStart(6, "0")} · ${escapar(pedido.cliente || "CONSUMIDOR FINAL")}</h1>
        <p class="meta">
          Vendedor: <strong>${escapar(pedido.vendedor || "—")}</strong>
          · ${fmtFecha(pedido.fecha)} ${escapar(String(pedido.hora_visita || "").slice(0, 5))}
          · Canal ${escapar(pedido.canal || "POS")}
          · Estado ${escapar(pedido.estado_pedido || "PENDIENTE")}
        </p>
        ${pedido.domicilio ? `<p class="meta2">${escapar(pedido.domicilio)}${pedido.localidad ? ` · ${escapar(pedido.localidad)}` : ""}${pedido.telefono ? ` · Tel. ${escapar(pedido.telefono)}` : ""}</p>` : ""}
      </div>
      <div class="total"><span>Total</span><strong>$ ${fmtMon(pedido.total)}</strong></div>
    </header>
    <table>
      <thead>
        <tr><th class="cod">Código</th><th>Producto</th><th class="num">Pedido</th><th class="num">Precio</th><th class="num">Cant. final</th></tr>
      </thead>
      <tbody>${items}</tbody>
    </table>
    ${pedido.observaciones ? `<p class="obs"><strong>Observaciones:</strong> ${escapar(pedido.observaciones)}</p>` : ""}
    <footer class="pie">
      <span>${escapar(empresa?.razon_social || empresa?.nombre || "")}</span>
      <span>Revisión del pedido · ____/____/______ · Firma: ______________________</span>
    </footer>
  </section>`;
}

async function generarPdfPedidosPendientes({ empresa, pedidos, titulo }) {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 12px; margin: 0; }
  .hoja { page-break-after: always; padding: 4px 0; }
  .hoja:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #4a3d8f; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 17px; margin: 0 0 4px; color: #3a3170; }
  .meta { margin: 0; color: #555; font-size: 11.5px; }
  .meta2 { margin: 3px 0 0; color: #666; font-size: 11px; }
  .total { text-align: right; white-space: nowrap; }
  .total span { display: block; font-size: 10px; color: #777; letter-spacing: 1px; }
  .total strong { font-size: 17px; color: #2E3A59; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #c9c9d4; padding: 5px 7px; }
  th { background: #2E3A59; color: #fff; text-align: left; font-size: 10.5px; letter-spacing: .5px; }
  td.cod, th.cod { width: 90px; font-family: Consolas, monospace; font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  td.box { width: 80px; height: 24px; background: #fafafa; }
  .obs { margin-top: 8px; font-size: 11.5px; color: #444; }
  .pie { margin-top: 14px; display: flex; justify-content: space-between; color: #777; font-size: 10px; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head>
<body>
  ${pedidos.map((p) => hojaPedido(p, empresa)).join("")}
</body></html>`;

  const directory = path.join(process.cwd(), "storage", "pdf", String(empresa?.nombre || "general"), "pedidos");
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `PEDIDOS-${(titulo || "PENDIENTES").replace(/[^A-Z0-9_-]/gi, "")}-${Date.now()}.pdf`;
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

  const url = `/storage/pdf/${empresa?.nombre || "general"}/pedidos/${fileName}`;
  return { fileName, filePath, url, publicUrl: urlPublica(url) };
}

module.exports = { generarPdfPedidosPendientes };
