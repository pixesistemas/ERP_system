class N8NWebhookService {
  isEnabled() {
    return process.env.N8N_WEBHOOK_ENABLED === "true";
  }

  async notifyInvoicePDF(payload) {
    if (!this.isEnabled()) return;

    if (!process.env.N8N_WEBHOOK_URL) {
      console.warn("N8N_WEBHOOK_URL no configurado");
      return;
    }

    const body = {
      evento: "pdf.generado",
      empresa: payload.factura.empresa.nombre,
      cliente: {
        razonSocial: payload.factura.cliente.razonSocial,
        cuit: payload.factura.cliente.cuit,
        condicionIVA: payload.factura.cliente.condicionIVA,
      },
      comprobante: {
        tipo: payload.request.tipoComprobante,
        puntoVenta: payload.request.puntoVenta,
        numero: payload.response.numero,
        cae: payload.response.cae,
        vencimiento: payload.response.vencimiento,
        total: payload.request.importeTotal,
      },
      pdf: {
        fileName: payload.pdf.fileName,
        url: `${process.env.PUBLIC_BASE_URL}${payload.pdf.url}`,
      },
    };

    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error notificando n8n: ${response.status} ${text}`);
    }
  }

  async notifyCommercialDocument(payload) {
    if (!this.isEnabled()) return;

    if (!process.env.N8N_WEBHOOK_URL) {
      console.warn("N8N_WEBHOOK_URL no configurado");
      return;
    }

    const documento = payload.documento;
    const pdf = payload.pdf;

    const body = {
      evento: "documento.pdf.generado",

      empresa: {
        id: payload.empresa?.id || null,
        nombre: payload.empresa?.nombre || null,
      },

      documento: {
        id: documento?.id || null,
        tipo: documento?.tipo || null,
        estado: documento?.estado || null,
        puntoVenta: documento?.punto_venta || null,
        numero: documento?.numero || null,
        fecha: documento?.fecha || documento?.created_at || null,
        importeTotal: Number(documento?.importe_total || 0),
        clienteId: documento?.cliente_id || null,
        vendedorId: documento?.vendedor_id || null,
      },

      pdf: {
        fileName: pdf?.fileName || null,
        url:
          pdf?.publicUrl ||
          (process.env.PUBLIC_BASE_URL && pdf?.url
            ? `${process.env.PUBLIC_BASE_URL}${pdf.url}`
            : pdf?.url),
      },
    };

    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",

        /*
         * Opcional, pero recomendado:
         * permite que n8n verifique que el webhook vino de tu ERP.
         */
        "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        `Error notificando n8n: ${response.status} ${responseText}`,
      );
    }
  }
}

module.exports = new N8NWebhookService();
