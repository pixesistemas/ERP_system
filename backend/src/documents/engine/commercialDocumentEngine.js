const fs = require("fs");
const path = require("path");

const CompanyAssetsLoader = require("./companyAssetsLoader");
const { getPlantillaComprobante } = require("../../repositories/empresa.repository");

/*
 * CommercialDocumentEngine
 *
 * Construye el HTML de presupuestos, remitos
 * y notas de pedido antes de convertirlos a PDF.
 */
class CommercialDocumentEngine {
  /*
   * Renderiza el documento comercial completo.
   */
  render({ empresa, documento, cliente = null, vendedor = null }) {
    const templatePath = path.join(
      process.cwd(),
      "src",
      "documents",
      "templates",
      "commercial",
      "documento.html",
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`No existe la plantilla comercial: ${templatePath}`);
    }

    let html = fs.readFileSync(templatePath, "utf8");

    const assets = CompanyAssetsLoader.load(empresa, {
      puntoVenta: documento.punto_venta,
    });
    const plantilla = getPlantillaComprobante(empresa.id) || {};
    const pieTexto = plantilla.pie || empresa.pieFactura || "";

    const tipo = this.normalizeDocumentType(documento.tipo);

    /*
     * Genera dinámicamente las columnas y filas.
     *
     * El remito no muestra precios.
     */
    const detailHeaderHtml = this.buildDetailHeader(tipo);

    const itemsHtml = this.buildItemsHtml({
      tipo,
      items: documento.items || [],
    });

    /*
     * Construye el bloque comercial:
     * condición de venta, lista y entrega.
     */
    const commercialInfoHtml = this.buildCommercialInfo({
      tipo,
      documento,
    });

    /*
     * Construye los totales según las reglas
     * visuales de cada tipo de documento.
     */
    const totalsHtml = this.buildTotalsHtml({
      tipo,
      documento,
    });

    /*
     * El remito muestra únicamente un pequeño
     * valor declarado fuera del bloque de totales.
     */
    const declaredValueHtml = this.buildDeclaredValueHtml({
      tipo,
      documento,
    });

    const replacements = {
      "{{LOGO}}": assets.logoHtml || "",

      "{{EMPRESA_NOMBRE}}": empresa.nombreFantasia || empresa.nombre || "",

      "{{EMPRESA_RAZON_SOCIAL}}": empresa.razonSocial || empresa.nombre || "",

      "{{EMPRESA_CUIT}}": empresa.cuit || "",

      "{{EMPRESA_IVA}}": empresa.condicionIVA || "",

      "{{EMPRESA_IIBB}}": empresa.ingresosBrutos || empresa.cuit || "",

      "{{EMPRESA_INICIO}}": this.escape(
        this.formatDate(empresa.inicioActividad),
      ),

      "{{EMPRESA_DIRECCION}}": this.formatEmpresaDireccion(empresa),

      "{{EMPRESA_TELEFONO}}": empresa.telefono || "",

      "{{EMPRESA_WHATSAPP}}": empresa.whatsapp || "",

      "{{EMPRESA_EMAIL}}": empresa.email || "",

      "{{LETRA}}": this.getDocumentLetter(tipo, documento),

      "{{CODIGO_COMPROBANTE}}": documento.comprobante_tipo_afip
        ? String(documento.comprobante_tipo_afip)
        : "0",

      "{{ORIGINAL}}": "ORIGINAL 1/1",

      "{{DOCUMENTO_TITULO}}": this.getDocumentTitle(tipo, documento),

      "{{PUNTO_VENTA}}": String(documento.punto_venta || 1).padStart(5, "0"),

      "{{NUMERO}}": String(documento.numero || 0).padStart(8, "0"),

      "{{DOCUMENTO_FECHA}}": this.formatDate(
        documento.fecha || documento.created_at,
      ),

      "{{DOCUMENTO_VENCIMIENTO}}": this.formatDate(
        documento.fecha_vencimiento,
      ),

      "{{DOCUMENTO_ESTADO}}": this.escape(documento.estado || ""),

      "{{CLIENTE_NOMBRE}}": this.escape(
        cliente?.razonSocial ||
          cliente?.razon_social ||
          cliente?.nombre ||
          documento.cliente_nombre ||
          "CONSUMIDOR FINAL",
      ),

      "{{CLIENTE_DOCUMENTO}}": this.escape(
        cliente?.cuit || cliente?.dni || documento.cliente_doc || "",
      ),

      "{{CLIENTE_DOMICILIO}}": this.escape(
        cliente?.domicilio || cliente?.direccion || "",
      ),

      "{{CLIENTE_IVA}}": this.escape(
        cliente?.condicionIVA || cliente?.condicion_iva || "",
      ),

      "{{CLIENTE_CONDICION_VENTA}}": this.escape(
        this.formatSaleCondition(
          documento.condicion_venta || "CONTADO",
        ),
      ),

      "{{CLIENTE_PROVINCIA}}": this.escape(
        this.formatProvincia(cliente),
      ),

      "{{VENDEDOR}}": this.escape(vendedor?.nombre || "SIN VENDEDOR"),

      "{{COMMERCIAL_INFO}}": commercialInfoHtml,

      "{{OBSERVACIONES}}": this.formatMultilineText(
        documento.observaciones || "",
      ),

      "{{DETAIL_HEADER}}": detailHeaderHtml,

      "{{ITEMS}}": itemsHtml,

      "{{TOTALS_BLOCK}}": totalsHtml,

      "{{DECLARED_VALUE}}": declaredValueHtml,

      "{{LEYENDA_NO_FISCAL}}": this.getNonFiscalLegend(tipo),
      "{{PIE}}": pieTexto,
    };

    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll(key, String(value ?? ""));
    }

    return html;
  }

  /*
   * Construye las cabeceras del detalle.
   *
   * El remito no incluye columnas económicas.
   */
  buildDetailHeader(tipo) {
    if (tipo === "REMITO") {
      return `
        <tr>
          <th class="col-qty">Cantidad</th>
          <th>Descripción</th>
          <th class="col-code">Codigo</th>
          <th class="col-unit">U. Medida</th>
        </tr>
      `;
    }

    return `
      <tr>
        <th class="col-qty">Cantidad</th>
        <th>Descripción</th>
        <th class="col-code">Codigo</th>
        <th class="col-unit">U. Medida</th>
        <th class="col-price">P. Unitario</th>
        <th class="col-disc">% Bonf.</th>
        <th class="col-sub">SubTotal</th>
      </tr>
    `;
  }

  /*
   * Construye todas las filas de artículos.
   */
  buildItemsHtml({ tipo, items }) {
    if (!Array.isArray(items) || items.length === 0) {
      const columnCount = tipo === "REMITO" ? 4 : 7;

      return `
        <tr>
          <td
            colspan="${columnCount}"
            class="empty-detail"
          >
            Sin artículos
          </td>
        </tr>
      `;
    }

    return items
      .map((item) =>
        this.buildItemRow({
          tipo,
          item,
        }),
      )
      .join("");
  }

  /*
   * Construye una fila del detalle.
   */
  buildItemRow({ tipo, item }) {
    const basicColumns = `
      <td class="center">
        ${this.number(item.cantidad, 3)}
      </td>

      <td>
        ${this.escape(item.descripcion || "")}
      </td>

      <td>
        ${this.escape(item.codigo || "")}
      </td>

      <td class="center">
        ${this.escape(item.unidad || "UN")}
      </td>
    `;

    /*
     * Los remitos no exponen precios
     * ni totales por renglón.
     */
    if (tipo === "REMITO") {
      return `
        <tr>
          ${basicColumns}
        </tr>
      `;
    }

    return `
      <tr>
        ${basicColumns}

        <td class="right">
          $ ${this.money(item.precio_unitario)}
        </td>

        <td class="right">
          ${this.number(item.descuento || 0, 2)}%
        </td>

        <td class="right">
          $ ${this.money(item.total)}
        </td>
      </tr>
    `;
  }

  /*
   * Devuelve la letra visible del documento comercial.
   */
  getDocumentLetter(tipo, documento = null) {
    if (documento?.comprobante_letra) {
      return documento.comprobante_letra;
    }

    const letters = {
      PRESUPUESTO: "P",
      REMITO: documento?.subtipo || "X",
      NOTA_PEDIDO: "N",
    };

    return letters[tipo] || "";
  }

  /*
   * Construye la ubicación del cliente
   * (localidad + provincia).
   */
  formatProvincia(cliente) {
    const localidad =
      cliente?.localidad || cliente?.ciudad || "";
    const provincia = cliente?.provincia || "";

    if (localidad && provincia) {
      return `${localidad}/ ${provincia}`;
    }

    if (provincia) {
      return provincia;
    }

    if (localidad) {
      return localidad;
    }

    return "/";
  }

  /*
   * Construye los datos comerciales visibles.
   */
  buildCommercialInfo({ tipo, documento }) {
    const condicionVenta = this.formatSaleCondition(
      documento.condicion_venta || "CONTADO",
    );

    const listaPrecio = String(documento.lista_precio || "GENERAL")
      .trim()
      .toUpperCase();

    const fechaEntrega = documento.fecha_entrega
      ? this.formatDate(documento.fecha_entrega)
      : null;

    const rows = [];

    /*
     * La condición de venta no es relevante
     * para el detalle visual del remito.
     */
    if (tipo !== "REMITO") {
      rows.push(`
        <div>
          <strong>Condición de venta:</strong>
          ${this.escape(condicionVenta)}
        </div>
      `);

      rows.push(`
        <div>
          <strong>Lista de precios:</strong>
          ${this.escape(listaPrecio)}
        </div>
      `);
    }

    if (fechaEntrega) {
      rows.push(`
        <div>
          <strong>Fecha de entrega:</strong>
          ${this.escape(fechaEntrega)}
        </div>
      `);
    }

    return rows.join("");
  }

  /*
   * Construye el bloque de importes de acuerdo
   * con el tipo de documento.
   */
  buildTotalsHtml({ tipo, documento }) {
    /*
     * El remito no muestra totales comerciales.
     */
    if (tipo === "REMITO") {
      return "";
    }

    const total = Number(documento.importe_total || 0);

    const importeBruto = Number(documento.importe_bruto ?? total);

    const descuentoGeneral = Number(documento.descuento_general || 0);

    const descuentoImporte = Number(documento.descuento_importe || 0);

    /*
     * El presupuesto no muestra neto ni IVA.
     *
     * Cuando existe descuento general, muestra
     * importe bruto, descuento y total final.
     */
    if (tipo === "PRESUPUESTO") {
      const discountRows =
        descuentoGeneral > 0
          ? `
            <div class="total-row">
              <span>Importe bruto</span>

              <strong class="right">
                $ ${this.money(importeBruto)}
              </strong>
            </div>

            <div class="total-row discount-row">
              <span>
                Descuento
                ${this.number(descuentoGeneral, 2)}%
              </span>

              <strong class="right">
                - $ ${this.money(descuentoImporte)}
              </strong>
            </div>
          `
          : "";

      return `
        <div class="totals">
          ${discountRows}

          <div class="total-row grand-total">
            <span>IMPORTE TOTAL:</span>

            <span class="right">
              $ ${this.money(total)}
            </span>
          </div>
        </div>
      `;
    }

    /*
     * La nota de pedido muestra el total comercial.
     * Neto e IVA quedan reservados para documentos
     * fiscales o futuras configuraciones.
     */
    return `
      <div class="totals">
        ${
          descuentoGeneral > 0
            ? `
              <div class="total-row">
                <span>Importe bruto</span>

                <strong class="right">
                  $ ${this.money(importeBruto)}
                </strong>
              </div>

              <div class="total-row discount-row">
                <span>
                  Descuento
                  ${this.number(descuentoGeneral, 2)}%
                </span>

                <strong class="right">
                  - $ ${this.money(descuentoImporte)}
                </strong>
              </div>
            `
            : ""
        }

        <div class="total-row grand-total">
          <span>IMPORTE TOTAL:</span>

          <span class="right">
            $ ${this.money(total)}
          </span>
        </div>
      </div>
    `;
  }

  /*
   * Construye el pequeño bloque de valor declarado
   * utilizado exclusivamente en remitos.
   */
  buildDeclaredValueHtml({ tipo, documento }) {
    if (tipo !== "REMITO") {
      return "";
    }

    /*
     * Primero intenta utilizar un campo específico.
     *
     * Mientras valor_declarado no exista, utiliza
     * importe_total como respaldo.
     */
    const valorDeclarado = Number(
      documento.valor_declarado ?? documento.importe_total ?? 0,
    );

    return `
      <div class="declared-value">
        <span>Valor declarado aproximado</span>

        <strong>
          $ ${this.money(valorDeclarado)}
        </strong>
      </div>
    `;
  }

  /*
   * Devuelve el título visible.
   */
  getDocumentTitle(tipo, documento = null) {
    const titles = {
      NOTA_PEDIDO: "NOTA DE PEDIDO",

      PRESUPUESTO: "PRESUPUESTO",

      REMITO: "REMITO",
    };

    const base = titles[tipo] || tipo || "DOCUMENTO";

    if (tipo === "REMITO") {
      return `${base} ${documento?.subtipo || "X"}`;
    }

    return base;
  }

  /*
   * Devuelve la leyenda no fiscal.
   */
  getNonFiscalLegend(tipo) {
    if (tipo === "PRESUPUESTO") {
      return "Documento no válido como factura.";
    }

    if (tipo === "NOTA_PEDIDO") {
      return "Documento interno sujeto a confirmación.";
    }

    if (tipo === "REMITO") {
      return "Documento de entrega de mercadería.";
    }

    return "";
  }

  /*
   * Normaliza el tipo del documento.
   */
  normalizeDocumentType(tipo) {
    return String(tipo || "")
      .trim()
      .toUpperCase();
  }

  /*
   * Convierte la condición almacenada
   * en una descripción legible.
   */
  formatSaleCondition(value) {
    const normalized = String(value || "CONTADO")
      .trim()
      .toUpperCase();

    const labels = {
      CONTADO: "CONTADO",

      CUENTA_CORRIENTE: "CUENTA CORRIENTE",
    };

    return labels[normalized] || normalized.replaceAll("_", " ");
  }

  /*
   * Construye la dirección completa.
   */
  formatEmpresaDireccion(empresa) {
    return [
      empresa.direccion,
      empresa.localidad,
      empresa.provincia,
      empresa.codigoPostal,
    ]
      .filter(Boolean)
      .map((value) => this.escape(value))
      .join(" - ");
  }

  /*
   * Formatea una fecha para Argentina.
   */
  formatDate(value) {
    if (!value) {
      return new Date().toLocaleDateString("es-AR");
    }

    /*
     * Evita problemas de zona horaria con
     * fechas almacenadas como YYYY-MM-DD.
     */
    const simpleDateMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (simpleDateMatch) {
      const [, year, month, day] = simpleDateMatch;

      return `${day}/${month}/${year}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("es-AR");
  }

  /*
   * Formatea importes monetarios.
   */
  money(value) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,

      maximumFractionDigits: 2,
    });
  }

  /*
   * Formatea cantidades y porcentajes.
   */
  number(value, decimals = 2) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: decimals,

      maximumFractionDigits: decimals,
    });
  }

  /*
   * Escapa texto para evitar HTML inválido.
   */
  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /*
   * Escapa texto y conserva saltos de línea.
   */
  formatMultilineText(value) {
    return this.escape(value).replaceAll("\n", "<br>");
  }
}

module.exports = new CommercialDocumentEngine();
