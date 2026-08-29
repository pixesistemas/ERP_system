const {
  buscarClientes,
  listarClientesSugeridos,
} = require("../repositories/cliente.repository");

const { buscarProductos } = require("../repositories/producto.repository");

const {
  listVendedoresByEmpresa,
} = require("../repositories/vendedor.repository");

/*
 * ResolverEngine
 *
 * Convierte los textos interpretados
 * en entidades reales del ERP.
 */
class ResolverEngine {
  /*
   * Busca clientes por documento, nombre,
   * apellido o razón social.
   */
  resolveCustomer({ empresaId, texto, limit = 5 }) {
    const textoOriginal = String(texto || "").trim();

    const textoLimpio = this.cleanCustomerText(textoOriginal);

    const documento = this.extractDocumentNumber(textoLimpio);

    const textoUtilizado = documento || textoLimpio;

    const resultados = buscarClientes({
      empresaId,

      texto: textoUtilizado,

      limit,
    });

    const resolution = this.buildCustomerResolution({
      empresaId,

      textoOriginal,

      textoUtilizado,

      resultados,

      limit,
    });

    resolution.textoUtilizado = textoUtilizado;

    return resolution;
  }

  /*
   * Construye la resolución del cliente.
   */
  buildCustomerResolution({
    empresaId,
    textoOriginal,
    textoUtilizado,
    resultados,
    limit,
  }) {
    const safeResults = Array.isArray(resultados) ? resultados : [];

    const queryText = this.normalize(textoUtilizado);

    const queryDocument = this.extractDocumentNumber(textoUtilizado);

    /*
     * Busca coincidencias exactas.
     */
    const exactos = safeResults.filter((cliente) =>
      this.isExactCustomerMatch({
        cliente,

        queryText,

        queryDocument,
      }),
    );

    if (exactos.length === 1) {
      return {
        tipo: "CLIENTE",

        consulta: textoOriginal,

        estado: "RESUELTO",

        seleccionado: exactos[0],

        opciones: safeResults,
      };
    }

    if (exactos.length > 1) {
      return {
        tipo: "CLIENTE",

        consulta: textoOriginal,

        estado: "REQUIERE_SELECCION",

        seleccionado: null,

        opciones: exactos,
      };
    }

    /*
     * Busca coincidencias donde todas las palabras
     * del cliente aparezcan en el candidato.
     */
    const compatibles = safeResults.filter((cliente) =>
      this.isCompatibleCustomerMatch({
        cliente,

        queryText,
      }),
    );

    if (compatibles.length === 1) {
      return {
        tipo: "CLIENTE",

        consulta: textoOriginal,

        estado: "RESUELTO",

        seleccionado: compatibles[0],

        opciones: compatibles,
      };
    }

    if (compatibles.length > 1) {
      return {
        tipo: "CLIENTE",

        consulta: textoOriginal,

        estado: "REQUIERE_SELECCION",

        seleccionado: null,

        opciones: compatibles,
      };
    }

    /*
     * Sin coincidencias no se ofrecen "sugerencias" de cualquier cliente:
     * el sistema responde que no lo encontró para mantener la coherencia
     * de la conversación (nadie quiere que le devuelvan 20 clientes al
     * escribir "juan").
     */
    return {
      tipo: "CLIENTE",

      consulta: textoOriginal,

      estado: "NO_ENCONTRADO",

      seleccionado: null,

      opciones: [],
    };
  }

  /*
   * Determina una coincidencia exacta
   * por documento o nombre completo.
   */
  isExactCustomerMatch({ cliente, queryText, queryDocument }) {
    if (queryDocument) {
      const documents = [cliente.cuit, cliente.dni, cliente.telefono]
        .filter(Boolean)
        .map((value) => this.onlyDigits(value));

      if (documents.includes(queryDocument)) {
        return true;
      }
    }

    return this.getCustomerNames(cliente).some(
      (name) => this.normalize(name) === queryText,
    );
  }

  /*
   * Determina una coincidencia parcial razonable.
   */
  isCompatibleCustomerMatch({ cliente, queryText }) {
    if (!queryText) {
      return false;
    }

    const words = this.getSignificantWords(queryText);

    if (words.length === 0) {
      return false;
    }

    return this.getCustomerNames(cliente).some((name) => {
      const normalizedName = this.normalize(name);

      if (this.isGenericCustomerName(normalizedName)) {
        return false;
      }

      return words.every((word) => normalizedName.includes(word));
    });
  }

  /*
   * Devuelve las distintas representaciones
   * del nombre de un cliente.
   */
  getCustomerNames(cliente) {
    return [
      cliente.razonSocial,
      cliente.razon_social,
      cliente.apellidoNombre,
      cliente.apellido_nombre,

      [cliente.nombre, cliente.apellido].filter(Boolean).join(" "),

      [cliente.apellido, cliente.nombre].filter(Boolean).join(" "),

      cliente.nombre,
    ].filter(Boolean);
  }

  /*
   * Evita nombres genéricos.
   */
  isGenericCustomerName(value) {
    return [
      "",
      "SIN NOMBRE",
      "CONSUMIDOR FINAL",
      "CLIENTE",
      "CLIENTE GENERICO",
      "CLIENTE GENÉRICO",
      "VARIOS",
    ].includes(this.normalize(value));
  }

  /*
   * Obtiene palabras útiles
   * para comparar clientes.
   */
  getSignificantWords(value) {
    return this.normalize(value)
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 2 &&
          ![
            "EL",
            "LA",
            "LOS",
            "LAS",
            "DE",
            "DEL",
            "Y",
            "CLIENTE",
            "SR",
            "SRA",
          ].includes(word),
      );
  }

  /*
   * Busca un producto por código,
   * código de barras o descripción.
   */
  resolveProduct({ empresaId, texto, limit = 5 }) {
    const textoOriginal = String(texto || "").trim();

    let resultados = buscarProductos({
      empresaId,

      texto: textoOriginal,

      limit,
    });

    let textoUtilizado = textoOriginal;

    /*
     * Intenta singularizar la descripción
     * cuando no encontró coincidencias.
     */
    if (resultados.length === 0) {
      const textoSingular = this.toSingularSearchText(textoOriginal);

      if (textoSingular && textoSingular !== textoOriginal) {
        resultados = buscarProductos({
          empresaId,

          texto: textoSingular,

          limit,
        });

        textoUtilizado = textoSingular;
      }
    }

    /*
     * Textos naturales ("5 hierros del 6", "cemento gris 25 kg") pueden no
     * matchear la frase entera aunque el producto exista en el catálogo.
     * Como último intento busca por la palabra clave más fuerte.
     */
    if (resultados.length === 0) {
      const STOPWORDS = new Set(["del","de","los","las","la","el","un","una","unos","unas","y","o","u","por","para","con","cm","mm","kg","mts","m3"]);
      const palabras = [...new Set(
        String(textoOriginal)
          .toLowerCase()
          .split(/[^a-záéíóúüñ0-9]+/i)
          .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
      )].sort((a, b) => b.length - a.length);

      for (const palabra of palabras) {
        const r = buscarProductos({ empresaId, texto: palabra, limit });
        if (Array.isArray(r) && r.length) {
          resultados = r;
          textoUtilizado = palabra;
          break;
        }
      }
    }

    const resolution = this.buildGenericResolution({
      tipo: "PRODUCTO",

      texto: textoOriginal,

      resultados,

      exactMatcher: (producto) => {
        const original = this.normalize(textoOriginal);

        const utilized = this.normalize(textoUtilizado);

        return [
          producto.codigo,
          producto.codigo_barra,
          producto.codbarra,
          producto.descripcion,
          producto.nombre,
        ]
          .filter(Boolean)
          .some((value) => {
            const normalized = this.normalize(value);

            return normalized === original || normalized === utilized;
          });
      },
    });

    resolution.textoUtilizado = textoUtilizado;

    return resolution;
  }

  /*
   * Busca vendedores activos por nombre.
   */
  resolveSeller({ empresaId, texto, limit = 5 }) {
    const value = this.normalize(texto);

    const resultados = listVendedoresByEmpresa(empresaId)
      .filter((seller) => this.normalize(seller.nombre).includes(value))
      .slice(0, limit);

    return this.buildGenericResolution({
      tipo: "VENDEDOR",

      texto,

      resultados,

      exactMatcher: (seller) => this.normalize(seller.nombre) === value,
    });
  }

  /*
   * Construye una resolución genérica
   * para productos y vendedores.
   */
  buildGenericResolution({ tipo, texto, resultados, exactMatcher }) {
    const safeResults = Array.isArray(resultados) ? resultados : [];

    const exactos = safeResults.filter(exactMatcher);

    if (exactos.length === 1) {
      return {
        tipo,

        consulta: texto,

        estado: "RESUELTO",

        seleccionado: exactos[0],

        opciones: safeResults,
      };
    }

    if (exactos.length === 0 && safeResults.length === 1) {
      return {
        tipo,

        consulta: texto,

        estado: "RESUELTO",

        seleccionado: safeResults[0],

        opciones: safeResults,
      };
    }

    if (safeResults.length === 0) {
      return {
        tipo,

        consulta: texto,

        estado: "NO_ENCONTRADO",

        seleccionado: null,

        opciones: [],
      };
    }

    return {
      tipo,

      consulta: texto,

      estado: "REQUIERE_SELECCION",

      seleccionado: null,

      opciones: safeResults,
    };
  }

  /*
   * Limpia prefijos frecuentes
   * en búsquedas de clientes.
   */
  cleanCustomerText(value) {
    return String(value || "")
      .trim()
      .replace(/^(?:PARA\s+)?(?:EL\s+CLIENTE|LA\s+CLIENTE|CLIENTE)\s+/i, "")
      .replace(/^(?:RAZON\s+SOCIAL|RAZÓN\s+SOCIAL)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
   * Extrae CUIT o DNI desde una frase.
   */
  extractDocumentNumber(value) {
    const text = String(value || "").trim();

    const explicit = text.match(
      /\b(?:CUIT|DNI)\s*(?:NRO\.?|N[ÚU]MERO|N[°º])?\s*:?\s*([0-9.\-\s]{7,20})/i,
    );

    if (explicit?.[1]) {
      const digits = this.onlyDigits(explicit[1]);

      if (digits.length >= 7 && digits.length <= 11) {
        return digits;
      }
    }

    if (/^[0-9.\-\s]+$/.test(text)) {
      const digits = this.onlyDigits(text);

      if (digits.length >= 7 && digits.length <= 11) {
        return digits;
      }
    }

    return null;
  }

  /*
   * Normaliza textos para comparar.
   */
  normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  /*
   * Conserva únicamente dígitos.
   */
  onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  /*
   * Convierte plurales simples en singular.
   */
  toSingularSearchText(value) {
    return String(value || "")
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (/^\d+$/.test(word) || word.length <= 3) {
          return word;
        }

        const lower = word.toLowerCase();

        if (lower.endsWith("les") && word.length > 5) {
          return word.slice(0, -2);
        }

        if (lower.endsWith("s")) {
          return word.slice(0, -1);
        }

        return word;
      })
      .join(" ");
  }
}

module.exports = new ResolverEngine();
