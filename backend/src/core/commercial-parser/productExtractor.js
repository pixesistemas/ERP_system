const Normalizer = require("./normalizer");
const NumberParser = require("./numberParser");

/*
 * ProductExtractor
 *
 * Extrae varios productos con sus cantidades
 * desde mensajes comerciales.
 */
class ProductExtractor {
  /*
   * Extrae todos los productos encontrados.
   */
  extract(message) {
    const original = Normalizer.removeTrailingPunctuation(message);

    if (!original) {
      return [];
    }

    const section = this.extractProductsSection(original);

    if (!section) {
      return [];
    }

    return this.extractProductsFromSection(section);
  }

  /*
   * Obtiene la sección que contiene
   * cantidades y productos.
   */
  extractProductsSection(message) {
    const text = Normalizer.clean(message);

    if (!text) {
      return "";
    }

    const wordPattern = NumberParser.getWordPattern();

    const quantityPattern = `(?:\\d+(?:[.,]\\d+)?|${wordPattern})`;

    /*
     * Encuentra el último conector comercial
     * seguido por una cantidad.
     *
     * No confunde "cliente con CUIT"
     * con "por 10 hierros".
     */
    const connectorPattern = new RegExp(
      `\\b(?:POR|CON|LLEVA|PRODUCTOS?|ART[IÍ]CULOS?|ITEMS?)\\s+(?=(?:${quantityPattern}\\s+)|\\S+\\s+[xX]\\s*(?:${quantityPattern}))(.+)$`,
      "i",
    );

    const connectorMatch = text.match(connectorPattern);

    if (connectorMatch?.[1]) {
      return this.removeCommercialConditions(connectorMatch[1]);
    }

    if (this.startsWithQuantity(text)) {
      return this.removeCommercialConditions(text);
    }

    if (this.endsWithQuantityX(text)) {
      return this.removeCommercialConditions(text);
    }

    return "";
  }

  /*
   * Localiza cada cantidad dentro de la sección
   * y utiliza su posición para separar productos.
   */
  extractProductsFromSection(section) {
    const text = Normalizer.clean(section);

    if (!text) {
      return [];
    }

    const wordPattern = NumberParser.getWordPattern();

    const quantityPattern = `(?:\\d+(?:[.,]\\d+)?|${wordPattern})`;

    const productStartPattern = new RegExp(
      `(?:^|[,;\\n]|\\b(?:Y|MAS|MÁS|TAMBIEN|TAMBIÉN)\\b)\\s*(${quantityPattern})\\s+`,
      "gi",
    );

    const starts = [];

    let match;

    while ((match = productStartPattern.exec(text)) !== null) {
      const quantityText = match[1];

      const quantityOffset = match[0]
        .toUpperCase()
        .lastIndexOf(quantityText.toUpperCase());

      const quantityPosition = match.index + quantityOffset;

      starts.push({
        quantityText,

        quantityPosition,

        descriptionStart: match.index + match[0].length,
      });

      if (match.index === productStartPattern.lastIndex) {
        productStartPattern.lastIndex += 1;
      }
    }

    const products = [];

    for (let index = 0; index < starts.length; index += 1) {
      const current = starts[index];

      const next = starts[index + 1] || null;

      const descriptionEnd = next ? next.quantityPosition : text.length;

      let rawDescription = text.slice(current.descriptionStart, descriptionEnd);

      rawDescription = this.removeTrailingProductSeparator(rawDescription);

      const quantity = NumberParser.parse(current.quantityText);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      const description = this.cleanProductDescription(rawDescription);

      if (!description) {
        continue;
      }

      products.push({
        quantity,
        description,

        rawText: `${current.quantityText} ${description}`,
      });
    }

    if (!starts.length) {
      return this.extractSuffixProducts(text);
    }

    return products;
  }

  /*
   * Extrae productos escritos con la cantidad después de una X,
   * como "cal x10" o "cal x 10 kilos".
   */
  extractSuffixProducts(section) {
    const text = Normalizer.clean(section);

    if (!text) {
      return [];
    }

    const wordPattern = NumberParser.getWordPattern();

    const unitPattern =
      "(?:UNIDADES?|BOLSAS?|CAJAS?|PAQUETES?|KILOS?|KG|GRAMOS?|GR|METROS?|MTS?|LITROS?|LTS?|ROLLOS?|PIEZAS?|PARES?)";

    const products = [];

    const segments = text.split(/,|;|(?:\b(?:Y|MAS|MÁS|TAMBIEN|TAMBIÉN)\b)/i);

    for (const segment of segments) {
      const match = segment.match(
        new RegExp(
          `^\\s*(.+?)\\s+[xX]\\s*(\\d+(?:[.,]\\d+)?|${wordPattern})\\s*(?:${unitPattern}\\s*)?$`,
          "i",
        ),
      );

      if (!match) {
        continue;
      }

      const quantity = NumberParser.parse(match[2]);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      const description = this.cleanProductDescription(match[1]);

      if (!description) {
        continue;
      }

      products.push({
        quantity,
        description,

        rawText: `${description} x${match[2]}`,
      });
    }

    return products;
  }

  /*
   * Elimina conectores que quedan
   * después del producto anterior.
   */
  removeTrailingProductSeparator(value) {
    return String(value || "")
      .replace(/\s*(?:,|;)\s*$/i, "")
      .replace(/\s+(?:Y|MAS|MÁS|TAMBIEN|TAMBIÉN)\s*$/i, "")
      .trim();
  }

  /*
   * Limpia la descripción de un producto.
   */
  cleanProductDescription(value) {
    let text = Normalizer.clean(value);

    if (!text) {
      return "";
    }

    /*
     * Elimina unidades genéricas.
     */
    text = text.replace(
      /^(?:UNIDADES?|BOLSAS?|CAJAS?|PAQUETES?|KILOS?|KG|GRAMOS?|GR|METROS?|MTS?|LITROS?|LTS?|ROLLOS?|PIEZAS?|PARES?)\s+(?:DE\s+)?/i,
      "",
    );

    text = text.replace(/^DE\s+/i, "");

    /*
     * Elimina la X de cantidad que quedó después o antes
     * del producto, como "cal x2" o "x2 cal".
     */
    text = text.replace(/\s+[xX]\s*\d+(?:[.,]\d+)?\s*$/i, "");
    text = text.replace(/^[xX]\s+/i, "");

    /*
     * Elimina palabras residuales dejadas
     * por condiciones como:
     *
     * "cementos con 10% de descuento"
     *                  ↓
     * "cementos con"
     */
    text = text.replace(/\s+(?:CON|Y\s+CON|APLICANDO|CON\s+UN)\s*$/i, "");

    text = text.replace(
      /\s+(?:CONTADO|EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE|MERCADO\s+PAGO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE\.?)$/i,
      "",
    );

    return Normalizer.removeTrailingPunctuation(text).trim();
  }

  /*
   * Elimina pagos, descuentos y fechas
   * que aparecen después de los productos.
   */
  removeCommercialConditions(value) {
    let text = Normalizer.clean(value);

    /*
     * Elimina desde el inicio de una expresión
     * de descuento, incluyendo el "con".
     */
    text = text.replace(
      /\s*,?\s*(?:Y\s+)?(?:CON\s+)?(?:UN\s+)?DESCUENTO\s+(?:DEL|DE)?\s*\d+(?:[.,]\d+)?\s*%?.*$/i,
      "",
    );

    text = text.replace(
      /\s*,?\s*(?:Y\s+)?(?:CON\s+)?\d+(?:[.,]\d+)?\s*%\s+DE\s+DESCUENTO.*$/i,
      "",
    );

    /*
     * Caso:
     * "cementos con 10% de descuento"
     */
    text = text.replace(
      /\s*,?\s*(?:Y\s+)?CON\s+\d+(?:[.,]\d+)?\s*%\s+(?:DE\s+)?DESCUENTO.*$/i,
      "",
    );

    /*
     * Elimina formas de pago posteriores.
     */
    text = text.replace(
      /\s*,?\s*(?:Y\s+)?(?:CONTADO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE\.?|TRANSFERENCIA|EFECTIVO|TARJETA|CHEQUE|MERCADO\s+PAGO)(?:\s|$).*$/i,
      "",
    );

    /*
     * Elimina fechas de entrega.
     */
    text = text.replace(
      /\s*,?\s*(?:ENTREGAR|ENTREGA|DESPACHAR)\s+(?:EL\s+)?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}.*$/i,
      "",
    );

    text = text.replace(
      /\s*,?\s*(?:ENTREGAR|ENTREGA|DESPACHAR|PARA)\s+(?:EL\s+)?(?:HOY|MAÑANA|PASADO\s+MAÑANA|PR[ÓO]XIMO\s+)?(?:LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[AÁ]BADO|DOMINGO)?.*$/i,
      "",
    );

    /*
     * Protección final para conectores sueltos.
     */
    return text.replace(/\s+(?:CON|Y\s+CON)\s*$/i, "").trim();
  }

  /*
   * Indica si el texto comienza con cantidad.
   */
  startsWithQuantity(value) {
    const wordPattern = NumberParser.getWordPattern();

    const pattern = new RegExp(
      `^(?:\\d+(?:[.,]\\d+)?|${wordPattern})\\s+`,
      "i",
    );

    return pattern.test(Normalizer.clean(value));
  }

  /*
   * Indica si el texto termina con una cantidad precedida por X,
   * como "cal x10".
   */
  endsWithQuantityX(value) {
    const wordPattern = NumberParser.getWordPattern();

    const unitPattern =
      "(?:UNIDADES?|BOLSAS?|CAJAS?|PAQUETES?|KILOS?|KG|GRAMOS?|GR|METROS?|MTS?|LITROS?|LTS?|ROLLOS?|PIEZAS?|PARES?)";

    const pattern = new RegExp(
      `\\s+[xX]\\s*(?:\\d+(?:[.,]\\d+)?|${wordPattern})\\s*(?:${unitPattern}\\s*)?$`,
      "i",
    );

    return pattern.test(Normalizer.clean(value));
  }
}

module.exports = new ProductExtractor();
