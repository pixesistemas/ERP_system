/*
 * MessageParser
 *
 * Extrae datos simples de un mensaje comercial,
 * como cantidad y texto utilizado para buscar productos.
 *
 * Más adelante este parser podrá complementarse con IA.
 */
class MessageParser {
  /*
   * Extrae cantidad y descripción de un producto.
   *
   * Ejemplo:
   * "20 bolsas de cemento"
   *
   * Devuelve:
   * {
   *   cantidad: 20,
   *   textoProducto: "cemento"
   * }
   */
  parseProductMessage(message) {
    const original = String(message || "").trim();

    if (!original) {
      return {
        cantidad: 1,
        textoProducto: "",
        originalMessage: original,
      };
    }

    const normalized = this.normalizeSpaces(original);

    /*
     * Busca un número entero o decimal al comienzo.
     *
     * Ejemplos válidos:
     * 20 cemento
     * 2.5 kilos de tornillos
     * 2,5 kilos de tornillos
     */
    const quantityMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);

    let cantidad = 1;
    let productText = normalized;

    if (quantityMatch) {
      cantidad = Number(quantityMatch[1].replace(",", "."));

      productText = quantityMatch[2];
    }

    /*
     * Elimina palabras que normalmente describen
     * unidades o acciones, pero no forman parte
     * del nombre real del producto.
     */
    productText = this.cleanProductText(productText);

    return {
      cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,

      textoProducto: productText,
      originalMessage: original,
    };
  }

  /*
   * Limpia palabras innecesarias antes
   * de buscar el producto en la base.
   */
  cleanProductText(value) {
    let text = String(value || "").trim();

    /*
     * Elimina verbos habituales al inicio.
     */
    text = text.replace(
      /^(AGREGA|AGREGAR|AGREGAME|SUMA|SUMAR|PONE|PONER|QUIERO|NECESITO)\s+/i,
      "",
    );

    /*
     * Elimina unidades comunes al inicio.
     *
     * No elimina palabras internas porque algunas
     * pueden ser parte de la descripción comercial.
     */
    text = text.replace(
      /^(UNIDADES?|UNIDAD|BOLSAS?|CAJAS?|PAQUETES?|KILOS?|KG|METROS?|MTS?|LITROS?|LTS?)\s+(DE\s+)?/i,
      "",
    );

    /*
     * Elimina un "de" inicial restante.
     */
    text = text.replace(/^DE\s+/i, "");

    return this.normalizeSpaces(text);
  }

  /*
   * Quita espacios duplicados y extremos.
   */
  normalizeSpaces(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }
  /*
   * Extrae cliente y producto de una frase comercial completa.
   *
   * Ejemplo:
   * "Haceme un presupuesto para José por 20 bolsas de cemento"
   *
   * Devuelve:
   * {
   *   clienteTexto: "José",
   *   cantidad: 20,
   *   productoTexto: "cemento"
   * }
   */
  parseCommercialOperation(message) {
    const original = this.normalizeSpaces(message);

    const result = {
      clienteTexto: null,
      cantidad: 1,
      productoTexto: null,
      originalMessage: original,
    };

    if (!original) {
      return result;
    }

    /*
     * Busca estructuras como:
     * "para José por 20 bolsas de cemento"
     * "para José con 20 bolsas de cemento"
     */
    const fullMatch = original.match(
      /\bPARA\s+(.+?)\s+(?:POR|CON)\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i,
    );

    if (fullMatch) {
      result.clienteTexto = this.normalizeSpaces(fullMatch[1]);

      const productData = this.parseProductMessage(
        `${fullMatch[2]} ${fullMatch[3]}`,
      );

      result.cantidad = productData.cantidad;
      result.productoTexto = productData.textoProducto;

      return result;
    }

    /*
     * Busca únicamente el cliente cuando el mensaje
     * tiene una estructura como "presupuesto para José".
     */
    const customerMatch = original.match(/\bPARA\s+(.+?)$/i);

    if (customerMatch) {
      result.clienteTexto = this.normalizeSpaces(customerMatch[1]);
    }

    return result;
  }
}

module.exports = new MessageParser();
