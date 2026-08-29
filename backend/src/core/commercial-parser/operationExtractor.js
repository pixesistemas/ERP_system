const Types = require("./commandTypes");

const Normalizer = require("./normalizer");

/*
 * Detecta la operación comercial solicitada.
 *
 * Cuando el mensaje contiene un documento de origen,
 * prioriza la operación destino.
 */
class OperationExtractor {
  /*
   * Extrae el tipo de operación comercial.
   */
  extract(message) {
    const text = Normalizer.normalize(message);

    if (!text) {
      return Types.UNKNOWN;
    }

    /*
     * Detecta notas de crédito antes que facturas,
     * porque una nota puede mencionar una factura origen.
     */
    if (
      this.containsAny(text, [
        "NOTA DE CREDITO",
        "NOTA CREDITO",
        "HACER NOTA DE CREDITO",
        "HACE UNA NOTA DE CREDITO",
        "CREAR NOTA DE CREDITO",
        "CREA UNA NOTA DE CREDITO",
        "GENERAR NOTA DE CREDITO",
        "GENERA UNA NOTA DE CREDITO",
      ])
    ) {
      return Types.NOTA_CREDITO;
    }

    /*
     * Detecta notas de débito antes que facturas.
     */
    if (
      this.containsAny(text, [
        "NOTA DE DEBITO",
        "NOTA DEBITO",
        "HACER NOTA DE DEBITO",
        "HACE UNA NOTA DE DEBITO",
        "CREAR NOTA DE DEBITO",
        "CREA UNA NOTA DE DEBITO",
        "GENERAR NOTA DE DEBITO",
        "GENERA UNA NOTA DE DEBITO",
      ])
    ) {
      return Types.NOTA_DEBITO;
    }

    /*
     * Detecta una conversión cuyo destino es factura.
     *
     * Ejemplo:
     * "Convertí el remito 25 en factura".
     */
    if (
      this.containsAny(text, [
        "EN FACTURA",
        "HACER FACTURA",
        "HACE UNA FACTURA",
        "CREAR FACTURA",
        "CREA UNA FACTURA",
        "GENERAR FACTURA",
        "GENERA UNA FACTURA",
        "FACTURAR",
        "FACTURAME",
        "FACTURALE",
        "FACTURA EL",
        "FACTURA LA",
      ])
    ) {
      return Types.FACTURA;
    }

    /*
     * Detecta presupuestos y cotizaciones.
     */
    if (
      this.containsAny(text, [
        "PRESUPUESTO",
        "COTIZACION",
        "COTIZAR",
        "COTIZAME",
      ])
    ) {
      return Types.PRESUPUESTO;
    }

    /*
     * Detecta notas u órdenes de pedido.
     */
    if (
      this.containsAny(text, [
        "NOTA DE PEDIDO",
        "ORDEN DE PEDIDO",
        "PEDIDO",
        "CREAR PEDIDO",
        "CREA UN PEDIDO",
        "HACER PEDIDO",
        "HACE UN PEDIDO",
        "HACEME UN PEDIDO",
        "HACELE UN PEDIDO",
        "TOMA UN PEDIDO",
        "TOMAME UN PEDIDO",
      ])
    ) {
      return Types.NOTA_PEDIDO;
    }

    /*
     * Detecta remitos.
     */
    if (
      this.containsAny(text, [
        "REMITO",
        "DESPACHO",
        "HACER REMITO",
        "HACE UN REMITO",
        "CREAR REMITO",
        "CREA UN REMITO",
        "GENERAR REMITO",
        "GENERA UN REMITO",
      ])
    ) {
      return Types.REMITO;
    }

    /*
     * Detecta facturas simples.
     */
    if (
      this.containsAny(text, ["FACTURA", "FACTURAR", "FACTURAME", "FACTURALE"])
    ) {
      return Types.FACTURA;
    }

    return Types.UNKNOWN;
  }

  /*
   * Indica si el texto contiene alguna
   * de las expresiones recibidas.
   */
  containsAny(text, options) {
    return options.some((option) =>
      text.includes(Normalizer.normalize(option)),
    );
  }
}

module.exports = new OperationExtractor();
