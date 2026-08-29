const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const DocumentEngine = require("../documents/engine/documentEngine");

class PDFService {
  async generateInvoicePDF({ factura, request, response, saved }) {
    const html = await DocumentEngine.renderInvoice({
      factura,
      request,
      response,
    });

    const dir = path.join(
      process.cwd(),
      "storage",
      "pdf",
      factura.empresa.nombre,
    );

    fs.mkdirSync(dir, { recursive: true });

    const fileName = `${request.tipoComprobante}-${request.puntoVenta}-${response.numero}.pdf`;
    const filePath = path.join(dir, fileName);

    const browser = await puppeteer.launch({
      headless: "new",
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "8mm",
        right: "8mm",
        bottom: "8mm",
        left: "8mm",
      },
    });

    await browser.close();

    return {
      filePath,
      fileName,
      facturaId: saved.facturaId,
    };
  }
}

module.exports = new PDFService();
