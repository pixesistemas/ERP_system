const path = require("path");

/*
 * WhatsAppCommercialResponseService
 *
 * Convierte el resultado interno del motor comercial
 * en una respuesta uniforme para n8n y WhatsApp.
 */
class WhatsAppCommercialResponseService {
  /*
   * Construye la respuesta final del endpoint.
   */
  build({ req, conversation, engineResult, idempotentReplay = false }) {
    const response = engineResult?.response || {};

    /*
     * El resultado comercial puede venir dentro
     * de response.result o directamente en engineResult.
     */
    const operationResult =
      response.result ||
      engineResult?.result ||
      engineResult?.resultado ||
      null;

    const documento = this.extractDocument(operationResult);

    const pdf = this.extractPdf({
      req,
      operationResult,
    });

    const imagen = this.findOperationValue(operationResult, "imagen");

    const context = conversation?.context || null;

    const command = this.extractCommand(context);

    const validation = command?.validation || context?.validation || null;

    return {
      ok: true,

      canal: "WHATSAPP",

      idempotentReplay,

      conversation: {
        id: conversation?.id || null,

        telefono: conversation?.telefono || null,

        estado: context?.state || conversation?.estado || null,

        workspaceId: context?.workspaceId || conversation?.workspaceId || null,
      },

      command,

      validation,

      response: {
        type: response.type || "CONVERSATION_RESPONSE",

        message: response.message || "",
      },

      /*
       * Se incorporan solamente cuando
       * ya existe un documento generado.
       */
      ...(documento
        ? {
            documento,
          }
        : {}),

      ...(pdf
        ? {
            pdf,
          }
        : {}),

      ...(imagen
        ? {
            imagen,
          }
        : {}),

      whatsapp: this.buildWhatsAppInstructions({
        telefono: conversation?.telefono || null,

        response,

        documento,

        pdf,

        imagen,
      }),
    };
  }

  /*
   * Extrae el comando comercial sin asumir
   * que siempre sea una instancia de clase.
   */
  extractCommand(context) {
    const command = context?.command || null;

    if (!command) {
      return null;
    }

    if (typeof command.toPlainObject === "function") {
      return command.toPlainObject();
    }

    return {
      ...command,
    };
  }

  /*
   * Busca un valor en varias estructuras anidadas.
   */
  findOperationValue(result, property) {
    return (
      result?.[property] ||
      result?.resultado?.[property] ||
      result?.result?.[property] ||
      result?.data?.[property] ||
      null
    );
  }

  /*
   * Extrae el documento desde las estructuras
   * que pueden devolver ProcessEngine y ConversationEngine.
   */
  extractDocument(result) {
    const source = this.findOperationValue(result, "documento");

    if (!source) {
      return null;
    }

    return {
      id: source.id || source.documentoId || source.documento_id || null,

      workspaceId: source.workspace_id || source.workspaceId || null,

      tipo: source.tipo || source.type || null,

      estado: source.estado || null,

      puntoVenta: source.punto_venta || source.puntoVenta || source.pv || null,

      numero: source.numero || source.number || null,

      condicionVenta: source.condicion_venta || source.condicionVenta || null,

      listaPrecio: source.lista_precio || source.listaPrecio || null,

      descuentoGeneral: this.numberOrNull(
        source.descuento_general ?? source.descuentoGeneral,
      ),

      descuentoImporte: this.numberOrNull(
        source.descuento_importe ?? source.descuentoImporte,
      ),

      importeBruto: this.numberOrNull(
        source.importe_bruto ?? source.importeBruto,
      ),

      neto: this.numberOrNull(source.importe_neto ?? source.neto),

      iva: this.numberOrNull(source.importe_iva ?? source.iva),

      total: this.numberOrNull(
        source.importe_total ?? source.total ?? source.importe,
      ),

      fechaEntrega: source.fecha_entrega || source.fechaEntrega || null,

      fecha: source.fecha || source.created_at || source.createdAt || null,

      pdfUrl: source.pdf_url || source.pdfUrl || null,
    };
  }

  /*
   * Extrae la información del PDF y genera
   * una URL pública cuando solo existe una ruta.
   */
  extractPdf({ req, operationResult }) {
    const source = this.findOperationValue(operationResult, "pdf");

    if (!source) {
      return null;
    }

    /*
     * Algunos procesos pueden devolver
     * directamente una ruta como texto.
     */
    if (typeof source === "string") {
      const relativePath = this.normalizeStoragePath(source);

      return {
        path: source,

        url: this.buildPublicUrl(req, relativePath),

        filename: this.extractFilename(source),

        mimeType: "application/pdf",
      };
    }

    const filePath = source.filePath || source.path || source.file || null;

    const informedUrl = source.publicUrl || source.url || null;

    const relativePath = filePath
      ? this.normalizeStoragePath(filePath)
      : informedUrl
        ? this.normalizeStoragePath(informedUrl)
        : null;

    const publicUrl = informedUrl
      ? this.ensureAbsoluteUrl(req, informedUrl)
      : this.buildPublicUrl(req, relativePath);

    const filename =
      source.filename ||
      source.fileName ||
      this.extractFilename(filePath || informedUrl);

    return {
      path: filePath,

      url: publicUrl,

      publicUrl,

      filename,

      mimeType: source.mimeType || source.mimetype || "application/pdf",
    };
  }

  /*
   * Convierte una ruta física en una ruta relativa
   * compatible con express.static("/storage").
   */
  normalizeStoragePath(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/\\/g, "/");

    if (!normalized) {
      return null;
    }

    /*
     * Cuando ya es una URL absoluta,
     * se extrae solamente su pathname.
     */
    if (/^https?:\/\//i.test(normalized)) {
      try {
        const parsed = new URL(normalized);

        return parsed.pathname.replace(/^\/storage\//i, "").replace(/^\/+/, "");
      } catch {
        return normalized;
      }
    }

    const storagePosition = normalized.toLowerCase().lastIndexOf("/storage/");

    if (storagePosition >= 0) {
      return normalized.substring(storagePosition + "/storage/".length);
    }

    if (normalized.toLowerCase().startsWith("storage/")) {
      return normalized.substring("storage/".length);
    }

    if (normalized.toLowerCase().startsWith("/storage/")) {
      return normalized.substring("/storage/".length);
    }

    return normalized.replace(/^\/+/, "");
  }

  /*
   * Convierte una URL relativa en absoluta.
   */
  ensureAbsoluteUrl(req, value) {
    const url = String(value || "").trim();

    if (!url) {
      return null;
    }

    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    const baseUrl = this.getBaseUrl(req);

    if (!baseUrl) {
      return url;
    }

    return baseUrl + (url.startsWith("/") ? url : `/${url}`);
  }

  /*
   * Genera la URL pública del PDF.
   */
  buildPublicUrl(req, relativePath) {
    if (!relativePath) {
      return null;
    }

    const baseUrl = this.getBaseUrl(req);

    if (!baseUrl) {
      return `/storage/${relativePath}`;
    }

    const encodedPath = String(relativePath)
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");

    return `${baseUrl}/storage/${encodedPath}`;
  }

  /*
   * Obtiene la URL base pública.
   *
   * Prioriza PUBLIC_BASE_URL y luego
   * utiliza los headers del proxy.
   */
  getBaseUrl(req) {
    const configuredBaseUrl = String(process.env.PUBLIC_BASE_URL || "")
      .trim()
      .replace(/\/+$/g, "");

    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }

    const protocolHeader = req?.headers?.["x-forwarded-proto"];

    const protocol = protocolHeader
      ? String(protocolHeader).split(",")[0].trim()
      : req?.protocol || "http";

    const forwardedHost = req?.headers?.["x-forwarded-host"];

    const host = forwardedHost
      ? String(forwardedHost).split(",")[0].trim()
      : typeof req?.get === "function"
        ? req.get("host")
        : req?.headers?.host;

    if (!host) {
      return null;
    }

    return `${protocol}://${host}`;
  }

  /*
   * Devuelve instrucciones simples para n8n.
   */
  buildWhatsAppInstructions({ telefono, response, documento, pdf, imagen }) {
    const completed =
      response.type === "OPERATION_COMPLETED" ||
      response.type === "DOCUMENT_CREATED" ||
      Boolean(documento);

    if (imagen?.url || imagen?.filePath) {
      return {
        action: "SEND_IMAGE",

        telefono,

        message: response.message || "Acá tenés tu QR de pago.",

        imageUrl: imagen.url || imagen.filePath,

        filename:
          imagen.filename ||
          imagen.fileName ||
          this.extractFilename(imagen.filePath || imagen.url),

        mimeType: imagen.mimeType || "image/png",
      };
    }

    if (completed && pdf?.url) {
      return {
        action: "SEND_DOCUMENT",

        telefono,

        message: response.message || this.buildCompletedMessage(documento),

        documentUrl: pdf.url,

        filename: pdf.filename || this.buildPdfFilename(documento),

        mimeType: pdf.mimeType || "application/pdf",
      };
    }

    return {
      action: "SEND_TEXT",

      telefono,

      message: response.message || "¡Listo! Quedó procesado.",
    };
  }

  /*
   * Construye el mensaje de operación completada.
   */
  buildCompletedMessage(documento) {
    if (!documento) {
      return "¡Listo! Quedó generado.";
    }

    const tipo = this.formatDocumentType(documento.tipo);

    const numero = this.formatDocumentNumber({
      puntoVenta: documento.puntoVenta,

      numero: documento.numero,
    });

    if (tipo && numero) {
      return `${tipo} ${numero} generado correctamente.`;
    }

    if (tipo) {
      return `${tipo} generado correctamente.`;
    }

    return "El documento fue generado correctamente.";
  }

  /*
   * Construye un nombre de archivo uniforme.
   */
  buildPdfFilename(documento) {
    const tipo = String(documento?.tipo || "DOCUMENTO")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");

    const puntoVenta = String(documento?.puntoVenta || 1).padStart(5, "0");

    const numero = String(documento?.numero || documento?.id || 0).padStart(
      8,
      "0",
    );

    return `${tipo}-${puntoVenta}-${numero}.pdf`;
  }

  /*
   * Formatea el tipo para el mensaje de WhatsApp.
   */
  formatDocumentType(value) {
    const type = String(value || "")
      .trim()
      .toUpperCase();

    const labels = {
      PRESUPUESTO: "Presupuesto",

      REMITO: "Remito",

      NOTA_PEDIDO: "Nota de pedido",

      FACTURA: "Factura",
    };

    return labels[type] || type || null;
  }

  /*
   * Formatea punto de venta y número.
   */
  formatDocumentNumber({ puntoVenta, numero }) {
    if (!puntoVenta && !numero) {
      return null;
    }

    return `${String(puntoVenta || 1).padStart(5, "0")}-${String(
      numero || 0,
    ).padStart(8, "0")}`;
  }

  /*
   * Obtiene el nombre desde una ruta.
   */
  extractFilename(value) {
    const normalized = String(value || "").replace(/\\/g, "/");

    if (!normalized) {
      return null;
    }

    try {
      if (/^https?:\/\//i.test(normalized)) {
        const parsed = new URL(normalized);

        return decodeURIComponent(path.basename(parsed.pathname));
      }
    } catch {
      // Continúa con path.basename.
    }

    return path.basename(normalized);
  }

  /*
   * Convierte un importe en número o null.
   */
  numberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
  }
}

module.exports = new WhatsAppCommercialResponseService();
