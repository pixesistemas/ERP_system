const eventBus = require("../eventBus");
const EVENTS = require("../events.constants");

const N8NWebhookService = require("../../services/n8nWebhook.service");

let registered = false;

function registerN8NListeners() {
  if (registered) return;

  eventBus.listen(EVENTS.PDF_GENERADO, async (payload) => {
    try {
      await N8NWebhookService.notifyInvoicePDF(payload);

      console.log("n8n notificado por factura:", payload.response?.numero);
    } catch (error) {
      console.error("Error notificando factura a n8n:", error.message);
    }
  });

  eventBus.listen(EVENTS.DOCUMENTO_PDF_GENERADO, async (payload) => {
    try {
      await N8NWebhookService.notifyCommercialDocument(payload);

      console.log(
        "n8n notificado por documento:",
        payload.documento?.tipo,
        payload.documento?.numero,
      );
    } catch (error) {
      console.error("Error notificando documento a n8n:", error.message);
    }
  });

  registered = true;
}

module.exports = registerN8NListeners;
