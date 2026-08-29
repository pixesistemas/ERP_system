const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");
const PDFService = require("../../pdf/pdf.service");

function registerPDFListeners() {
  eventBus.listen(EVENTS.FACTURA_GUARDADA, async (payload) => {
    try {
      console.log("Generando PDF...");

      const pdf = await PDFService.generateInvoicePDF(payload);

      payload.response.pdf = {
        filePath: pdf.filePath,
        fileName: pdf.fileName,
        url: `/storage/pdf/${payload.factura.empresa.nombre}/${pdf.fileName}`,
      };

      console.log("PDF generado:", pdf.filePath);

      eventBus.emitEvent(EVENTS.PDF_GENERADO, {
        ...payload,
        pdf,
      });
    } catch (error) {
      console.error("Error generando PDF:");
      console.error(error);
    }
  });
}

module.exports = registerPDFListeners;
