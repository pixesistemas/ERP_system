/*
 * CommercialWorkspaceMapper
 *
 * Convierte los datos interpretados por
 * CommercialParser al formato del Workspace.
 */
class CommercialWorkspaceMapper {
  /*
   * Construye todos los datos comerciales
   * que deben guardarse en el workspace.
   */
  map({ command, channel = null, telefonoOrigen = null }) {
    if (!command) {
      const error = new Error("El comando comercial es obligatorio");

      error.statusCode = 400;

      throw error;
    }

    return {
      condicionVenta: this.mapPayment(command.payment),

      listaPrecio: this.mapPriceList(command.priceList),

      descuentoGeneral: this.mapDiscount(command.discount),

      observaciones: this.mapNotes(command.notes),

      fechaEntrega: this.mapDeliveryDate(command.deliveryDate),

      canal: this.mapChannel(channel || command.channel),

      telefonoOrigen: this.mapPhone(telefonoOrigen),

      tipoOperacion: (command.operation || "PEDIDO").toUpperCase(),
    };
  }

  /*
   * Convierte una condición de pago
   * en condición de venta.
   */
  mapPayment(payment) {
    if (!payment?.type) {
      return "CONTADO";
    }

    const type = this.normalizeText(payment.type);

    const currentAccountTypes = [
      "CUENTA_CORRIENTE",
      "CUENTACORRIENTE",
      "CTA_CTE",
      "CTACTE",
      "CREDITO",
    ];

    if (currentAccountTypes.includes(type)) {
      return "CUENTA_CORRIENTE";
    }

    return "CONTADO";
  }

  /*
   * Convierte la lista detectada
   * en un nombre para Pricing Engine.
   */
  mapPriceList(priceList) {
    if (!priceList) {
      return "GENERAL";
    }

    if (typeof priceList === "string") {
      return String(priceList).trim().toUpperCase() || "GENERAL";
    }

    return (
      String(priceList.name || priceList.value || priceList.type || "GENERAL")
        .trim()
        .toUpperCase() || "GENERAL"
    );
  }

  /*
   * Obtiene el porcentaje
   * de descuento general.
   */
  mapDiscount(discount) {
    if (!discount) {
      return 0;
    }

    const value = Number(
      discount.value ?? discount.percentage ?? discount.percent ?? 0,
    );

    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(100, Math.max(0, value));
  }

  /*
   * Convierte las notas del comando
   * en un único texto.
   */
  mapNotes(notes) {
    if (!notes) {
      return null;
    }

    if (!Array.isArray(notes)) {
      return String(notes).trim() || null;
    }

    const values = notes
      .map((note) => {
        if (typeof note === "string") {
          return note.trim();
        }

        return String(
          note?.text || note?.value || note?.description || "",
        ).trim();
      })
      .filter(Boolean);

    return values.length > 0 ? values.join("\n") : null;
  }

  /*
   * Convierte la fecha de entrega
   * en un valor persistible.
   */
  mapDeliveryDate(deliveryDate) {
    if (!deliveryDate) {
      return null;
    }

    if (typeof deliveryDate === "string") {
      return deliveryDate.trim() || null;
    }

    return (
      deliveryDate.date ||
      deliveryDate.value ||
      deliveryDate.isoDate ||
      deliveryDate.rawText ||
      null
    );
  }

  /*
   * Normaliza el canal
   * de origen del comando.
   */
  mapChannel(channel) {
    return (
      String(channel || "API")
        .trim()
        .toUpperCase() || "API"
    );
  }

  /*
   * Normaliza el teléfono
   * de origen del comando.
   */
  mapPhone(phone) {
    if (!phone) {
      return null;
    }

    const normalized = String(phone).replace(/\D/g, "");

    return normalized || null;
  }

  /*
   * Normaliza texto para comparar
   * alias y valores comerciales.
   */
  normalizeText(value) {
    return String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .toUpperCase();
  }
}

module.exports = new CommercialWorkspaceMapper();
