/*
 * Construye respuestas uniformes para cualquier canal:
 * WhatsApp, API REST, React o n8n.
 */
class CommercialConversationResponseBuilder {
  /*
   * Solicita la operación comercial.
   */
  askOperation(context) {
    return this.build({
      type: "ASK_OPERATION",

      message:
        "¿Qué querés hacer? Me decís si es presupuesto, pedido, remito o factura y arrancamos.",

      context,
    });
  }

  /*
   * Solicita el cliente.
   */
  askCustomer(context) {
    return this.build({
      type: "ASK_CUSTOMER",

      message: "¿Para quién es el pedido? Pasame el nombre, CUIT o DNI y te lo busco.",

      context,
    });
  }

  /*
   * Informa que el cliente no fue encontrado.
   */
  customerNotFound(context, customerText) {
    return this.build({
      type: "CUSTOMER_NOT_FOUND",

      message: `No encontré a nadie que se parezca a "${customerText}". Probá con el nombre, CUIT o DNI.`,

      context,
    });
  }

  /*
   * Solicita elegir entre varios clientes.
   */
  selectCustomer(context, options) {
    return this.build({
      type: "SELECT_CUSTOMER",

      message: this.buildCustomerOptionsMessage(options),

      options,

      context,
    });
  }

  /*
   * Solicita un producto.
   */
  askProduct(context) {
    return this.build({
      type: "ASK_PRODUCT",

      message: "¿Qué querés agregar? Poné la cantidad y el producto, y te lo cargo.",

      context,
    });
  }

  /*
   * Informa que un producto no fue encontrado.
   */
  productNotFound(context, productText) {
    return this.build({
      type: "PRODUCT_NOT_FOUND",

      message: `No hallé nada parecido a "${productText}". Escribí otro producto, decime "omitilo" o "cambialo por...".`,

      actions: ["OMITIR_PRODUCTO", "REEMPLAZAR_PRODUCTO", "AGREGAR_OTRO"],

      context,
    });
  }

  /*
   * Solicita elegir entre varios productos.
   */
  selectProduct(context, options, metadata = {}) {
    return this.build({
      type: "SELECT_PRODUCT",

      message: this.buildProductOptionsMessage(options, metadata),

      options,

      metadata,

      context,
    });
  }

  /*
   * Solicita confirmación final.
   */
  askConfirmation(context, summary) {
    const formattedSummary = this.formatConfirmationSummary(summary);

    return this.build({
      type: "CONFIRM_OPERATION",

      message: `${formattedSummary}\n\nSi está todo bien, poné "confirmar" y lo cargo. O "cancelar" si lo dejamos.`,

      context,
    });
  }

  /*
   * Convierte el resumen estructurado del Workspace en texto legible.
   * Evita que JavaScript muestre el mensaje genérico "[object Object]".
   */
  formatConfirmationSummary(summary) {
    if (typeof summary === "string") return summary;
    if (!summary || typeof summary !== "object") return "Resumen de la operación";

    const lines = [
      "Esto es lo que llevás:",
      "",
      `Empresa: ${summary.empresa || "Empresa actual"}`,
      `Operación: ${summary.tipoOperacion || summary.operacion || "Documento comercial"}`,
      `Cliente: ${summary.clienteNombre || summary.cliente || (summary.clienteId ? `#${summary.clienteId}` : "Consumidor final")}`,
    ];

    if (summary.condicionVenta) lines.push(`Condición: ${summary.condicionVenta}`);
    if (summary.listaPrecio) lines.push(`Lista de precios: ${summary.listaPrecio}`);

    const items = Array.isArray(summary.items) ? summary.items : [];
    lines.push("", "Productos:");

    if (items.length === 0) {
      lines.push("- Sin productos");
    } else {
      items.forEach((item) => {
        const quantity = Number(item.cantidad ?? item.quantity ?? 1);
        const description = item.descripcion || item.description || item.nombre || "Producto";
        const unitPrice = Number(item.precioUnitario ?? item.precio ?? item.price ?? 0);
        const subtotal = Number(item.subtotal ?? quantity * unitPrice);
        const priceText = subtotal > 0
          ? ` — $ ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "";
        lines.push(`- ${quantity} x ${description}${priceText}`);
      });
    }

    const totals = summary.totals || {};
    const total = Number(totals.total ?? summary.total ?? 0);
    if (total > 0) {
      lines.push(
        "",
        `Total: $ ${total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      );
    }

    const errors = Array.isArray(summary.errores) ? summary.errores : [];
    if (errors.length > 0) {
      lines.push("", "Pendientes:", ...errors.map((error) => `- ${error}`));
    }

    return lines.join("\n");
  }

  /*
   * Informa que el comando fue completado.
   */
  completed(context, result) {
    const documento = result?.documento || null;
    const facturaId = result?.facturaId || result?.saved?.facturaId || null;
    const pdf = result?.pdf || documento?.pdf || null;
    const lines = ["¡Listo! Quedó cargado."];

    if (documento) {
      const pv = String(documento.punto_venta || documento.puntoVenta || 1).padStart(4, "0");
      const numero = String(documento.numero || 0).padStart(8, "0");
      lines.push("", `${documento.tipo || "DOCUMENTO"}: ${pv}-${numero}`, `Estado: ${documento.estado || "GENERADO"}`);
    } else if (facturaId) {
      lines.push("", `Factura guardada con ID interno ${facturaId}.`);
    }

    if (pdf?.url) lines.push("PDF disponible desde el módulo Comprobantes.");

    return this.build({
      type: "OPERATION_COMPLETED",
      message: lines.join("\n"),
      result,
      actions: pdf?.url ? ["VER_COMPROBANTE"] : null,
      context,
    });
  }

  /*
   * Informa la cancelación.
   */
  cancelled(context) {
    return this.build({
      type: "OPERATION_CANCELLED",

      message: "Dale, lo cancelamos. Si querés retomamos cuando quieras.",

      context,
    });
  }

  /*
   * Construye la respuesta estándar.
   */
  build({ type, message, options = null, actions = null, result = null, context }) {
    return {
      ok: true,

      response: {
        type,
        message,

        ...(options
          ? {
              options,
            }
          : {}),

        ...(actions ? { actions } : {}),

        ...(result
          ? {
              result,
            }
          : {}),
      },

      context: context.toPlainObject(),
    };
  }

  /*
   * Construye el listado de clientes.
   */
  buildCustomerOptionsMessage(options) {
    const lines = [options.length === 1 ? "Lo encontré a este, ¿es él? (decime sí o elegí otro):" : "Aparecieron varios, elegí uno:"];

    options.forEach((customer, index) => {
      const name =
        customer.nombre ||
        customer.razon_social ||
        customer.razonSocial ||
        customer.descripcion ||
        `Cliente ${customer.id}`;

      const document =
        customer.cuit || customer.dni || customer.documento || "";

      lines.push(`${index + 1}. ${name}${document ? ` - ${document}` : ""}`);
    });

    return lines.join("\n");
  }

  /*
   * Construye el listado de productos.
   */
  buildProductOptionsMessage(options, metadata = {}) {
    const quantityText = Number(metadata.quantity || 0) > 0
      ? ` para agregar ${Number(metadata.quantity).toLocaleString("es-AR")} unidad/es`
      : "";
    const searchText = metadata.searchText ? ` de “${metadata.searchText}”` : "";
    const lines = [`Aparecieron varias opciones${searchText}${quantityText}. ¿Cuál le mandamos?`];

    options.forEach((product, index) => {
      const description =
        product.descripcion || product.descrip || `Producto ${product.id}`;

      const code =
        product.codigo || product.codbarra || product.codigo_barra || "";

      const price = Number(product.precio || 0);
      const priceText = price > 0
        ? ` · $ ${price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "";
      lines.push(`${index + 1}. ${description}${code ? ` - ${code}` : ""}${priceText}`);
    });

    return lines.join("\n");
  }
}

module.exports = new CommercialConversationResponseBuilder();
