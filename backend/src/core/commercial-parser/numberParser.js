const Normalizer = require("./normalizer");

/*
 * Convierte cantidades numéricas o escritas
 * en palabras a valores numéricos.
 */
class NumberParser {
  constructor() {
    this.units = Object.freeze({
      CERO: 0,
      UN: 1,
      UNO: 1,
      UNA: 1,
      DOS: 2,
      TRES: 3,
      CUATRO: 4,
      CINCO: 5,
      SEIS: 6,
      SIETE: 7,
      OCHO: 8,
      NUEVE: 9,
      DIEZ: 10,
      ONCE: 11,
      DOCE: 12,
      TRECE: 13,
      CATORCE: 14,
      QUINCE: 15,
      DIECISEIS: 16,
      DIECISIETE: 17,
      DIECIOCHO: 18,
      DIECINUEVE: 19,
      VEINTE: 20,
      VEINTIUNO: 21,
      VEINTIDOS: 22,
      VEINTITRES: 23,
      VEINTICUATRO: 24,
      VEINTICINCO: 25,
      VEINTISEIS: 26,
      VEINTISIETE: 27,
      VEINTIOCHO: 28,
      VEINTINUEVE: 29,
    });

    this.tens = Object.freeze({
      TREINTA: 30,
      CUARENTA: 40,
      CINCUENTA: 50,
      SESENTA: 60,
      SETENTA: 70,
      OCHENTA: 80,
      NOVENTA: 90,
    });

    this.hundreds = Object.freeze({
      CIEN: 100,
      CIENTO: 100,
      DOSCIENTOS: 200,
      TRESCIENTOS: 300,
      CUATROCIENTOS: 400,
      QUINIENTOS: 500,
      SEISCIENTOS: 600,
      SETECIENTOS: 700,
      OCHOCIENTOS: 800,
      NOVECIENTOS: 900,
    });
  }

  /*
   * Convierte un texto en número.
   */
  parse(value, defaultValue = null) {
    const original = String(value || "").trim();

    if (!original) {
      return defaultValue;
    }

    const numericValue = Number(original.replace(",", "."));

    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }

    const text = Normalizer.normalize(original);

    if (Object.prototype.hasOwnProperty.call(this.units, text)) {
      return this.units[text];
    }

    if (Object.prototype.hasOwnProperty.call(this.tens, text)) {
      return this.tens[text];
    }

    if (Object.prototype.hasOwnProperty.call(this.hundreds, text)) {
      return this.hundreds[text];
    }

    return this.parseCompoundWords(text, defaultValue);
  }

  /*
   * Interpreta cantidades como "treinta y cinco".
   */
  parseCompoundWords(value, defaultValue) {
    const tokens = value.split(/\s+/).filter((token) => token && token !== "Y");

    if (tokens.length === 0) {
      return defaultValue;
    }

    let total = 0;

    for (const token of tokens) {
      if (Object.prototype.hasOwnProperty.call(this.hundreds, token)) {
        total += this.hundreds[token];
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(this.tens, token)) {
        total += this.tens[token];
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(this.units, token)) {
        total += this.units[token];
        continue;
      }

      return defaultValue;
    }

    return total;
  }

  /*
   * Devuelve una expresión regular con números escritos.
   */
  getWordPattern() {
    return [
      ...Object.keys(this.hundreds),
      ...Object.keys(this.tens),
      ...Object.keys(this.units),
    ]
      .sort((a, b) => b.length - a.length)
      .join("|");
  }
}

module.exports = new NumberParser();
