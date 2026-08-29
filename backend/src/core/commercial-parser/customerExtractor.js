const Normalizer = require("./normalizer");

/*
 * CustomerExtractor
 *
 * Extrae el texto utilizado para identificar al cliente.
 *
 * Prioriza CUIT o DNI explícitos antes de intentar
 * interpretar nombres o razones sociales.
 */
class CustomerExtractor {
  /*
   * Busca el cliente dentro del mensaje recibido.
   */
  extract(message) {
    const original = Normalizer.clean(message);

    if (!original) {
      return null;
    }

    /*
     * Prioridad 1:
     * CUIT informado explícitamente.
     *
     * Ejemplos:
     * "cliente con CUIT 20333170818"
     * "para el CUIT 20-33317081-8"
     */
    const cuit = this.extractCuit(original);

    if (cuit) {
      return cuit;
    }

    /*
     * Prioridad 2:
     * DNI informado explícitamente.
     *
     * Ejemplos:
     * "cliente DNI 30111222"
     * "para el DNI 30.111.222"
     */
    const dni = this.extractDni(original);

    if (dni) {
      return dni;
    }

    /*
     * Caso principal con productos:
     *
     * "presupuesto para Juan Pérez por 10 hierros"
     * "pedido para Ferretería López con 5 cementos"
     *
     * El conector CON solo se considera inicio de productos
     * cuando a continuación aparece una cantidad.
     */
    const customerWithProducts = original.match(
      /\bPARA\s+(?:EL\s+CLIENTE\s+|LA\s+CLIENTE\s+|CLIENTE\s+)?(.+?)\s+(?:POR|CON|LLEVA)\s+(?=(?:\d+(?:[.,]\d+)?|UN\b|UNA\b|DOS\b|TRES\b|CUATRO\b|CINCO\b|SEIS\b|SIETE\b|OCHO\b|NUEVE\b|DIEZ\b|ONCE\b|DOCE\b|TRECE\b|CATORCE\b|QUINCE\b|VEINTE\b|TREINTA\b|CUARENTA\b|CINCUENTA\b)|\S+\s+[xX]\s*(?:\d+(?:[.,]\d+)?|UN\b|UNA\b|DOS\b|TRES\b|CUATRO\b|CINCO\b|SEIS\b|SIETE\b|OCHO\b|NUEVE\b|DIEZ\b|ONCE\b|DOCE\b|TRECE\b|CATORCE\b|QUINCE\b|VEINTE\b|TREINTA\b|CUARENTA\b|CINCUENTA\b))/i,
    );

    if (customerWithProducts?.[1]) {
      const customer = this.cleanCustomer(customerWithProducts[1]);

      if (!this.isInvalidCustomer(customer)) {
        return customer;
      }
    }

    /*
     * Caso de facturación directa:
     *
     * "facturame a Juan por 10 hierros"
     * "facturale a Ferretería López con 5 cementos"
     */
    const invoiceCustomerWithProducts = original.match(
      /\b(?:FACTURAR|FACTURAME|FACTURALE|FACTURA)\s+A\s+(?:EL\s+CLIENTE\s+|LA\s+CLIENTE\s+|CLIENTE\s+)?(.+?)\s+(?:POR|CON|LLEVA)\s+(?=(?:\d+(?:[.,]\d+)?|UN\b|UNA\b|DOS\b|TRES\b|CUATRO\b|CINCO\b|SEIS\b|SIETE\b|OCHO\b|NUEVE\b|DIEZ\b|ONCE\b|DOCE\b|TRECE\b|CATORCE\b|QUINCE\b|VEINTE\b|TREINTA\b|CUARENTA\b|CINCUENTA\b)|\S+\s+[xX]\s*(?:\d+(?:[.,]\d+)?|UN\b|UNA\b|DOS\b|TRES\b|CUATRO\b|CINCO\b|SEIS\b|SIETE\b|OCHO\b|NUEVE\b|DIEZ\b|ONCE\b|DOCE\b|TRECE\b|CATORCE\b|QUINCE\b|VEINTE\b|TREINTA\b|CUARENTA\b|CINCUENTA\b))/i,
    );

    if (invoiceCustomerWithProducts?.[1]) {
      const customer = this.cleanCustomer(invoiceCustomerWithProducts[1]);

      if (!this.isInvalidCustomer(customer)) {
        return customer;
      }
    }

    /*
     * Caso sin productos:
     *
     * "presupuesto para Juan Pérez"
     * "pedido para Ferretería López, contado"
     */
    const customerWithoutProducts = original.match(
      /\bPARA\s+(?:EL\s+CLIENTE\s+|LA\s+CLIENTE\s+|CLIENTE\s+)?(.+?)(?=\s+(?:CONTADO|EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE|MERCADO\s+PAGO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE\.?|DESCUENTO|ENTREGAR|ENTREGA|DESPACHAR)\b|[,;.]|$)/i,
    );

    if (customerWithoutProducts?.[1]) {
      const customer = this.cleanCustomer(customerWithoutProducts[1]);

      if (!this.isInvalidCustomer(customer)) {
        return customer;
      }
    }

    /*
     * Caso explícito:
     *
     * "cliente José"
     * "cliente Ferretería López, contado"
     */
    const explicitCustomer = original.match(
      /\bCLIENTE\s+(.+?)(?=\s+(?:POR|LLEVA|CONTADO|EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE|MERCADO\s+PAGO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE\.?|DESCUENTO|ENTREGAR|ENTREGA)\b|[,;.]|$)/i,
    );

    if (explicitCustomer?.[1]) {
      const customer = this.cleanCustomer(explicitCustomer[1]);

      if (!this.isInvalidCustomer(customer)) {
        return customer;
      }
    }

    /*
     * Caso de factura sin productos:
     *
     * "facturame a José contado"
     */
    const invoiceCustomer = original.match(
      /\b(?:FACTURAR|FACTURAME|FACTURALE|FACTURA)\s+A\s+(.+?)(?=\s+(?:CONTADO|EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE|MERCADO\s+PAGO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE\.?|DESCUENTO|ENTREGAR|ENTREGA)\b|[,;.]|$)/i,
    );

    if (invoiceCustomer?.[1]) {
      const customer = this.cleanCustomer(invoiceCustomer[1]);

      if (!this.isInvalidCustomer(customer)) {
        return customer;
      }
    }

    return null;
  }

  /*
   * Extrae y normaliza un CUIT argentino.
   */
  extractCuit(value) {
    const match = String(value || "").match(
      /\bCUIT\s*(?:NRO\.?|N[ÚU]MERO|N[°º])?\s*:?\s*([0-9.\-\s]{11,20})/i,
    );

    if (!match?.[1]) {
      return null;
    }

    const digits = match[1].replace(/\D/g, "");

    /*
     * El CUIT argentino contiene exactamente 11 dígitos.
     */
    if (digits.length !== 11) {
      return null;
    }

    return digits;
  }

  /*
   * Extrae y normaliza un DNI.
   */
  extractDni(value) {
    const match = String(value || "").match(
      /\bDNI\s*(?:NRO\.?|N[ÚU]MERO|N[°º])?\s*:?\s*([0-9.\-\s]{7,15})/i,
    );

    if (!match?.[1]) {
      return null;
    }

    const digits = match[1].replace(/\D/g, "");

    if (digits.length < 7 || digits.length > 9) {
      return null;
    }

    return digits;
  }

  /*
   * Limpia conectores y puntuación que no pertenecen
   * al nombre o razón social del cliente.
   */
  cleanCustomer(value) {
    return Normalizer.removeTrailingPunctuation(value)
      .replace(/^(?:EL\s+CLIENTE|LA\s+CLIENTE|CLIENTE)\s+/i, "")
      .replace(/\s+(?:CON\s+)?(?:CUIT|DNI)\s*[:NROº°.\-]*\s*[0-9.\-\s]+$/i, "")
      .replace(/\s+(?:POR|LLEVA)$/i, "")
      .trim();
  }

  /*
   * Evita interpretar pagos, fechas o conectores
   * como clientes.
   */
  isInvalidCustomer(value) {
    const text = Normalizer.normalize(value);

    if (!text) {
      return true;
    }

    if (/^(POR|LLEVA)\b/.test(text)) {
      return true;
    }

    return [
      "HOY",
      "MANANA",
      "PASADO MANANA",
      "LUNES",
      "MARTES",
      "MIERCOLES",
      "JUEVES",
      "VIERNES",
      "SABADO",
      "DOMINGO",
      "CONTADO",
      "EFECTIVO",
      "TRANSFERENCIA",
      "TARJETA",
      "CHEQUE",
      "MERCADO PAGO",
      "CUENTA CORRIENTE",
    ].includes(text);
  }
}

module.exports = new CustomerExtractor();
