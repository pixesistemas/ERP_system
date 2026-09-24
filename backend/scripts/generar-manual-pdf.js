/*
 * Convierte un manual HTML en PDF (A4, con colores y saltos de página).
 *
 * Uso:
 *   node scripts/generar-manual-pdf.js ../docs/manual-vendedor.html ../docs/manual-vendedor.pdf
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function main() {
  const entrada = process.argv[2];
  const salida = process.argv[3];

  if (!entrada || !salida) {
    console.error("Uso: node scripts/generar-manual-pdf.js <archivo.html> <salida.pdf>");
    process.exit(1);
  }

  const htmlPath = path.resolve(process.cwd(), entrada);
  const pdfPath = path.resolve(process.cwd(), salida);

  if (!fs.existsSync(htmlPath)) {
    console.error(`No existe el HTML: ${htmlPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

  const html = fs.readFileSync(htmlPath, "utf8");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await browser.close();
  }

  console.log(`PDF generado: ${pdfPath}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
