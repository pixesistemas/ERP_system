/*
 * Tipos de operaciones comerciales soportadas.
 *
 * NC y ND se conservan como alias para mantener
 * compatibilidad con código anterior del proyecto.
 */
const CommandTypes = {
  UNKNOWN: "UNKNOWN",

  PRESUPUESTO: "PRESUPUESTO",

  NOTA_PEDIDO: "NOTA_PEDIDO",

  REMITO: "REMITO",

  FACTURA: "FACTURA",

  NOTA_CREDITO: "NOTA_CREDITO",

  NOTA_DEBITO: "NOTA_DEBITO",
};

/*
 * Alias compatibles con versiones anteriores.
 */
CommandTypes.NC = CommandTypes.NOTA_CREDITO;

CommandTypes.ND = CommandTypes.NOTA_DEBITO;

module.exports = Object.freeze(CommandTypes);
