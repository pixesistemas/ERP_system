/*
 * Tipos y medios de pago reconocidos
 * por el Commercial Parser.
 */
module.exports = Object.freeze({
  TERMS: Object.freeze({
    CONTADO: "CONTADO",
    CUENTA_CORRIENTE: "CUENTA_CORRIENTE",
  }),

  METHODS: Object.freeze({
    EFECTIVO: "EFECTIVO",
    TRANSFERENCIA: "TRANSFERENCIA",
    TARJETA: "TARJETA",
    CHEQUE: "CHEQUE",
    MERCADO_PAGO: "MERCADO_PAGO",
    OTRO: "OTRO",
  }),
});
