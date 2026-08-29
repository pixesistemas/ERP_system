const Normalizer = require("./normalizer");

/*
 * Extrae descuentos globales porcentuales.
 */
class DiscountExtractor {
  /*
   * Detecta el descuento solicitado.
   */
  extract(message) {
    const original = Normalizer.clean(message);

    const normalized = Normalizer.normalize(message);

    if (!original) {
      return null;
    }

    if (
      ["SIN DESCUENTO", "NO APLICAR DESCUENTO", "DESCUENTO CERO"].some(
        (expression) => normalized.includes(expression),
      )
    ) {
      return {
        type: "PERCENTAGE",
        value: 0,
        rawText: "SIN DESCUENTO",
      };
    }

    const patterns = [
      /\bDESCUENTO\s+(?:DEL|DE)?\s*(\d+(?:[.,]\d+)?)\s*%?/i,
      /\b(\d+(?:[.,]\d+)?)\s*%\s+DE\s+DESCUENTO\b/i,
      /\b(?:APLICA|APLICAR|APLICAME)\s+(?:UN\s+)?(\d+(?:[.,]\d+)?)\s*%/i,
      /\bREBAJA\s+(?:DEL|DE)?\s*(\d+(?:[.,]\d+)?)\s*%?/i,
    ];

    for (const pattern of patterns) {
      const match = original.match(pattern);

      if (!match?.[1]) {
        continue;
      }

      const value = Number(match[1].replace(",", "."));

      if (!Number.isFinite(value) || value < 0 || value > 100) {
        continue;
      }

      return {
        type: "PERCENTAGE",
        value,
        rawText: match[0],
      };
    }

    return null;
  }
}

module.exports = new DiscountExtractor();
