/*
 * Centraliza la limpieza y normalización de textos.
 */
class Normalizer {
  /*
   * Limpia espacios duplicados.
   */
  clean(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
   * Normaliza mayúsculas, tildes y espacios.
   */
  normalize(value) {
    return this.clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  /*
   * Elimina puntuación final.
   */
  removeTrailingPunctuation(value) {
    return this.clean(value).replace(/[.,;:!?]+$/g, "");
  }

  /*
   * Indica si el texto contiene una expresión completa.
   */
  containsExpression(text, expression) {
    const normalizedText = this.normalize(text);

    const normalizedExpression = this.normalize(expression);

    return normalizedText.includes(normalizedExpression);
  }
}

module.exports = new Normalizer();
