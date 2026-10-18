require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { conNavegador } = require("../src/pdf/navegador");

/*
 * Genera el PDF del instructivo de cajeros y turnos a partir del HTML.
 * Uso: npm run docs:guia-cajeros
 */

const origen = path.join(__dirname, "../../docs/guia-cajeros-turnos.html");
const destino = path.join(__dirname, "../../docs/guia-cajeros-turnos.pdf");

(async () => {
  if (!fs.existsSync(origen)) {
    console.error(`No existe ${origen}`);
    process.exit(1);
  }
  const html = fs
    .readFileSync(origen, "utf8")
    .replace(/@page\s*\{[^}]*\}/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  await conNavegador(async (browser) => {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: destino,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
  });

  const bytes = fs.statSync(destino).size;
  console.log(`Guía generada: ${destino} (${Math.round(bytes / 1024)} KB)`);
})().catch((error) => {
  console.error("No se pudo generar la guía:", error.message);
  process.exit(1);
});
