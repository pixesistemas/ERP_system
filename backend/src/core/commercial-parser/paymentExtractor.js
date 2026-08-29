const Normalizer = require("./normalizer");
const PaymentTypes = require("./paymentTypes");

/*
 * Detecta condición y medio de pago.
 */
class PaymentExtractor {
  /*
   * Extrae datos de pago desde el mensaje.
   */
  extract(message) {
    const text = Normalizer.normalize(message);

    if (!text) {
      return null;
    }

    if (
      this.containsAny(text, [
        "CUENTA CORRIENTE",
        "CTA CTE",
        "CTA. CTE.",
        "FIADO",
      ])
    ) {
      return {
        type: PaymentTypes.TERMS.CUENTA_CORRIENTE,
        method: null,
        rawText: "CUENTA CORRIENTE",
      };
    }

    if (
      this.containsAny(text, [
        "TRANSFERENCIA",
        "TRANSFERIR",
        "DEPOSITO BANCARIO",
      ])
    ) {
      return this.buildCashPayment(
        PaymentTypes.METHODS.TRANSFERENCIA,
        "TRANSFERENCIA",
      );
    }

    if (
      this.containsAny(text, ["MERCADO PAGO", "MERCADOPAGO"]) ||
      /\bMP\b/.test(text)
    ) {
      return this.buildCashPayment(
        PaymentTypes.METHODS.MERCADO_PAGO,
        "MERCADO PAGO",
      );
    }

    if (this.containsAny(text, ["TARJETA", "CREDITO", "DEBITO"])) {
      return this.buildCashPayment(PaymentTypes.METHODS.TARJETA, "TARJETA");
    }

    if (this.containsAny(text, ["CHEQUE", "ECHEQ", "E-CHEQ"])) {
      return this.buildCashPayment(PaymentTypes.METHODS.CHEQUE, "CHEQUE");
    }

    if (this.containsAny(text, ["EFECTIVO", "CASH"])) {
      return this.buildCashPayment(PaymentTypes.METHODS.EFECTIVO, "EFECTIVO");
    }

    if (this.containsAny(text, ["CONTADO", "PAGO INMEDIATO"])) {
      return {
        type: PaymentTypes.TERMS.CONTADO,
        method: null,
        rawText: "CONTADO",
      };
    }

    return null;
  }

  /*
   * Construye un pago contado.
   */
  buildCashPayment(method, rawText) {
    return {
      type: PaymentTypes.TERMS.CONTADO,
      method,
      rawText,
    };
  }

  /*
   * Busca expresiones dentro del texto.
   */
  containsAny(text, options) {
    return options.some((option) =>
      text.includes(Normalizer.normalize(option)),
    );
  }
}

module.exports = new PaymentExtractor();
