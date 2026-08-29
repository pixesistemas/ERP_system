const Intents = require("./conversationIntents");

/*
 * IntentDetector
 *
 * Analiza un mensaje y determina qué intención
 * comercial parece expresar el usuario.
 *
 * Esta primera versión utiliza palabras clave.
 * Más adelante podrá delegar el análisis a una IA.
 */
class IntentDetector {
  /*
   * Detecta la intención principal del mensaje.
   */
  detect(message) {
    const text = this.normalize(message);

    if (!text) {
      return {
        intent: Intents.UNKNOWN,
        confidence: 0,
        originalMessage: message,
      };
    }

    if (this.matchesAny(text, ["CANCELAR", "CANCELA", "ANULAR", "OLVIDAR"])) {
      return this.buildResult({
        intent: Intents.CANCEL,
        confidence: 1,
        message,
      });
    }

    if (
      this.matchesAny(text, [
        "CONFIRMAR",
        "CONFIRMO",
        "ACEPTO",
        "ESTA BIEN",
        "DALE",
        "SI",
      ])
    ) {
      return this.buildResult({
        intent: Intents.CONFIRM,
        confidence: 0.95,
        message,
      });
    }

    if (
      this.matchesAny(text, ["AYUDA", "QUE PUEDO HACER", "OPCIONES", "MENU"])
    ) {
      return this.buildResult({
        intent: Intents.HELP,
        confidence: 1,
        message,
      });
    }

    if (
      this.matchesAny(text, ["PRESUPUESTO", "COTIZACION", "COTIZAR", "COTIZA"])
    ) {
      return this.buildResult({
        intent: Intents.CREATE_QUOTATION,
        confidence: 0.95,
        message,
      });
    }

    if (
      this.matchesAny(text, ["NOTA DE PEDIDO", "PEDIDO", "ORDEN DE PEDIDO"])
    ) {
      return this.buildResult({
        intent: Intents.CREATE_ORDER,
        confidence: 0.9,
        message,
      });
    }

    if (this.matchesAny(text, ["REMITO", "ENTREGA", "DESPACHO"])) {
      return this.buildResult({
        intent: Intents.CREATE_REMITO,
        confidence: 0.9,
        message,
      });
    }

    if (
      this.matchesAny(text, ["FACTURA", "FACTURAR", "FACTURALE", "FACTURAME"])
    ) {
      return this.buildResult({
        intent: Intents.CREATE_INVOICE,
        confidence: 0.95,
        message,
      });
    }

    if (
      this.matchesAny(text, [
        "AGREGAR",
        "AGREGA",
        "SUMAR",
        "SUMA",
        "ANADIR",
        "PONER",
      ])
    ) {
      return this.buildResult({
        intent: Intents.ADD_PRODUCT,
        confidence: 0.7,
        message,
      });
    }

    if (
      this.matchesAny(text, [
        "QUITAR",
        "QUITA",
        "ELIMINAR",
        "ELIMINA",
        "SACAR",
        "SACA",
      ])
    ) {
      return this.buildResult({
        intent: Intents.REMOVE_PRODUCT,
        confidence: 0.8,
        message,
      });
    }

    return this.buildResult({
      intent: Intents.UNKNOWN,
      confidence: 0,
      message,
    });
  }

  /*
   * Construye una respuesta uniforme para la detección.
   */
  buildResult({ intent, confidence, message }) {
    return {
      intent,
      confidence,
      originalMessage: message,
    };
  }

  /*
   * Indica si el texto contiene alguna frase configurada.
   */
  matchesAny(text, options) {
    return options.some((option) => text.includes(this.normalize(option)));
  }

  /*
   * Normaliza el mensaje para comparar sin tildes
   * y sin diferencias entre mayúsculas y minúsculas.
   */
  normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }
}

module.exports = new IntentDetector();
