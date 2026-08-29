/*
 * Intenciones que podrá reconocer el módulo conversacional.
 * Más adelante podrán provenir de un modelo de IA.
 */
module.exports = Object.freeze({
  CREATE_QUOTATION: "CREATE_QUOTATION",
  CREATE_ORDER: "CREATE_ORDER",
  CREATE_REMITO: "CREATE_REMITO",
  CREATE_INVOICE: "CREATE_INVOICE",

  ADD_PRODUCT: "ADD_PRODUCT",
  REMOVE_PRODUCT: "REMOVE_PRODUCT",
  CHANGE_QUANTITY: "CHANGE_QUANTITY",

  CONFIRM: "CONFIRM",
  CANCEL: "CANCEL",
  HELP: "HELP",
  UNKNOWN: "UNKNOWN",
});
