const Normalizer = require("./normalizer");
const DocumentTypes = require("./documentTypes");

/*
 * Extrae documentos comerciales utilizados como origen.
 */
class DocumentExtractor {
  /*
   * Detecta tipo y número del documento.
   */
  extract(message) {
    const original = Normalizer.clean(message);

    if (!original) {
      return null;
    }

    const definitions = [
      {
        type: DocumentTypes.PRESUPUESTO,
        pattern:
          /\bPRESUPUESTO\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
      {
        type: DocumentTypes.NOTA_PEDIDO,
        pattern:
          /\b(?:NOTA\s+DE\s+PEDIDO|ORDEN\s+DE\s+PEDIDO)\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
      {
        type: DocumentTypes.REMITO,
        pattern:
          /\bREMITO\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
      {
        type: DocumentTypes.NOTA_CREDITO,
        pattern:
          /\bNOTA\s+DE\s+CR[EÉ]DITO\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
      {
        type: DocumentTypes.NOTA_DEBITO,
        pattern:
          /\bNOTA\s+DE\s+D[EÉ]BITO\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
      {
        type: DocumentTypes.FACTURA,
        pattern:
          /\bFACTURA(?:\s+[ABC])?\s+(?:NRO\.?|NUMERO|N[ÚU]MERO|N°|#)?\s*(\d{1,5}(?:[-/]\d{1,10})?)/i,
      },
    ];

    for (const definition of definitions) {
      const match = original.match(definition.pattern);

      if (!match?.[1]) {
        continue;
      }

      const numbering = this.parseDocumentNumber(match[1]);

      if (!numbering) {
        continue;
      }

      return {
        type: definition.type,
        pointOfSale: numbering.pointOfSale,
        number: numbering.number,
        formattedNumber: numbering.formattedNumber,
        rawText: match[0],
      };
    }

    return null;
  }

  /*
   * Separa punto de venta y número.
   */
  parseDocumentNumber(value) {
    const text = String(value || "")
      .trim()
      .replace("/", "-");

    if (!text) {
      return null;
    }

    if (text.includes("-")) {
      const parts = text.split("-");

      if (parts.length !== 2) {
        return null;
      }

      const pointOfSale = Number(parts[0]);

      const number = Number(parts[1]);

      if (
        !Number.isInteger(pointOfSale) ||
        pointOfSale < 0 ||
        !Number.isInteger(number) ||
        number <= 0
      ) {
        return null;
      }

      return {
        pointOfSale,
        number,
        formattedNumber: this.formatNumber(pointOfSale, number),
      };
    }

    const number = Number(text);

    if (!Number.isInteger(number) || number <= 0) {
      return null;
    }

    return {
      pointOfSale: null,
      number,
      formattedNumber: String(number),
    };
  }

  /*
   * Formatea punto de venta y número.
   */
  formatNumber(pointOfSale, number) {
    return (
      String(pointOfSale).padStart(4, "0") +
      "-" +
      String(number).padStart(8, "0")
    );
  }
}

module.exports = new DocumentExtractor();
