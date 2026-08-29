const Types = require("./commandTypes");

/*
 * Representa una orden comercial independiente
 * del canal que originó el mensaje.
 */
class CommercialCommand {
  constructor({
    operation = Types.UNKNOWN,
    customer = null,
    products = [],
    payment = null,
    discount = null,
    seller = null,
    priceList = null,
    sourceDocument = null,
    deliveryDate = null,
    notes = [],
    rawMessage = "",
    channel = "API",
    condicionVenta = null,
  } = {}) {
    this.operation = operation;

    this.customer = {
      id: customer?.id || null,
      text: customer?.text || null,
    };

    this.products = Array.isArray(products) ? products : [];

    this.payment = payment;

    this.discount = discount;

    this.seller = seller;

    this.priceList = priceList;

    this.sourceDocument = sourceDocument;

    this.deliveryDate = deliveryDate;

    this.notes = Array.isArray(notes) ? notes : [];

    this.rawMessage = String(rawMessage || "");

    this.channel = String(channel || "API")
      .trim()
      .toUpperCase();

    this.condicionVenta = condicionVenta || null;
  }

  /*
   * Indica si existe una operación identificada.
   */
  hasOperation() {
    return this.operation && this.operation !== Types.UNKNOWN;
  }

  /*
   * Indica si existe un cliente identificado.
   */
  hasCustomer() {
    return Boolean(this.customer?.id || this.customer?.text);
  }

  /*
   * Indica si existen productos.
   */
  hasProducts() {
    return this.products.length > 0;
  }

  /*
   * Convierte la instancia en un objeto simple.
   */
  toPlainObject() {
    return {
      operation: this.operation,
      customer: { ...this.customer },
      products: this.products.map((product) => ({
        ...product,
      })),
      payment: this.payment ? { ...this.payment } : null,
      discount: this.discount ? { ...this.discount } : null,
      seller: this.seller,
      priceList: this.priceList,
      sourceDocument: this.sourceDocument ? { ...this.sourceDocument } : null,
      deliveryDate: this.deliveryDate ? { ...this.deliveryDate } : null,
      notes: [...this.notes],
      rawMessage: this.rawMessage,
      channel: this.channel,
      condicionVenta: this.condicionVenta,
    };
  }
}

module.exports = CommercialCommand;
