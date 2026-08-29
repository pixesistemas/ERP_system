const Normalizer = require("./normalizer");

/*
 * Extrae fechas absolutas, relativas
 * y días de la semana.
 */
class DateExtractor {
  /*
   * Detecta una fecha de entrega.
   */
  extract(message) {
    const original = Normalizer.clean(message);

    const normalized = Normalizer.normalize(message);

    if (!original) {
      return null;
    }

    const absolute = this.extractAbsoluteDate(original);

    if (absolute) {
      return absolute;
    }

    const relativeDefinitions = [
      {
        expressions: [
          "ENTREGAR PASADO MANANA",
          "ENTREGA PASADO MANANA",
          "PARA PASADO MANANA",
        ],
        value: "DAY_AFTER_TOMORROW",
      },
      {
        expressions: ["ENTREGAR MANANA", "ENTREGA MANANA", "PARA MANANA"],
        value: "TOMORROW",
      },
      {
        expressions: ["ENTREGAR HOY", "ENTREGA HOY", "PARA HOY"],
        value: "TODAY",
      },
      {
        expressions: [
          "LA SEMANA QUE VIENE",
          "PROXIMA SEMANA",
          "SEMANA PROXIMA",
        ],
        value: "NEXT_WEEK",
      },
    ];

    for (const definition of relativeDefinitions) {
      const expression = definition.expressions.find((item) =>
        normalized.includes(item),
      );

      if (expression) {
        return {
          type: "RELATIVE",
          value: definition.value,
          date: null,
          weekday: null,
          rawText: expression,
        };
      }
    }

    return this.extractWeekday(original);
  }

  /*
   * Detecta fechas DD/MM/YYYY o DD-MM-YYYY.
   */
  extractAbsoluteDate(message) {
    const match = message.match(
      /\b(?:ENTREGAR|ENTREGA|PARA|DESPACHAR)?\s*(?:EL\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/i,
    );

    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);

    if (year < 100) {
      year += 2000;
    }

    if (!this.isValidDate(year, month, day)) {
      return null;
    }

    return {
      type: "ABSOLUTE",
      value: null,
      date: this.formatISODate(year, month, day),
      weekday: null,
      rawText: match[0].trim(),
    };
  }

  /*
   * Detecta días de la semana.
   */
  extractWeekday(message) {
    const weekdays = {
      LUNES: 1,
      MARTES: 2,
      MIERCOLES: 3,
      JUEVES: 4,
      VIERNES: 5,
      SABADO: 6,
      DOMINGO: 0,
    };

    const normalized = Normalizer.normalize(message);

    const match = normalized.match(
      /\b(?:ENTREGAR|ENTREGA|PARA|DESPACHAR)?\s*(?:EL\s+)?(?:(PROXIMO|PROXIMA)\s+)?(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\b/i,
    );

    if (!match?.[2]) {
      return null;
    }

    const weekdayName = match[2].toUpperCase();

    return {
      type: "WEEKDAY",
      value: match[1] ? "NEXT_WEEKDAY" : "WEEKDAY",
      date: null,
      weekday: {
        name: weekdayName,
        number: weekdays[weekdayName],
      },
      rawText: match[0].trim(),
    };
  }

  /*
   * Valida que la fecha exista.
   */
  isValidDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  /*
   * Formatea una fecha como YYYY-MM-DD.
   */
  formatISODate(year, month, day) {
    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }
}

module.exports = new DateExtractor();
