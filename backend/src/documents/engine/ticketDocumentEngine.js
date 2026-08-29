const fs = require("fs");
const path = require("path");

const db = require("../../db/database");
const QRGenerator = require("../../pdf/engine/qrGenerator");
const CompanyAssetsLoader = require("./companyAssetsLoader");
const CuentaCorrienteService = require("../../services/cuentaCorriente.service");
const { resolverDocumentoCliente } = require("../../afip/fiscalResolver");
const { getPlantillaComprobante } = require("../../repositories/empresa.repository");

/*
 * TicketDocumentEngine
 *
 * Renderiza el comprobante que se imprime al cerrar una venta de POS
 * (factura, nota de venta X o remito de retiro de reserva), en formato
 * A4 o ticket de 80mm según el punto de venta. Usa el mismo lenguaje
 * visual (cajas con borde, mismas proporciones) que el resto de los
 * comprobantes del sistema (documentEngine / commercialDocumentEngine),
 * para que no se vea como un documento aparte.
 *
 * Cuando el comprobante tiene CAE (factura electrónica autorizada por
 * AFIP), agrega el bloque fiscal con el QR oficial de ARCA, el CAE y
 * su vencimiento.
 */
class TicketDocumentEngine {
  async render({ empresa, sale, items }) {
    const templatePath = path.join(
      process.cwd(),
      "src",
      "documents",
      "templates",
      "ticket",
      "ticket.html",
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`No existe la plantilla de ticket: ${templatePath}`);
    }

    let html = fs.readFileSync(templatePath, "utf8");

    const esTicket80 =
      String(sale.formato_impresion || "A4").toUpperCase() === "80MM";

    const assets = CompanyAssetsLoader.load(empresa, {
      puntoVenta: sale.punto_venta,
    });
    const nombreFantasia = this.getNombreFantasiaPuntoVenta(
      empresa.id,
      sale.punto_venta,
    );
    const plantilla = getPlantillaComprobante(empresa.id) || {};
    const pieTexto = plantilla.pie || empresa.pieFactura || "";
    const fontSize = Number(plantilla.fontSize) || null;
    const fontFamily = String(plantilla.fontFamily || "Arial").trim() || "Arial";
    let footerPegado = plantilla.footerPegado !== false;

    // Desde la configuración de cada comprobante (Pantalla Comprobantes)
    // se puede indicar si el pie queda pegado al detalle o al pie de la hoja.
    try {
      const row = db
        .prepare(
          "SELECT pie_pegado FROM config_comprobantes WHERE empresa_id=? AND tipo=?",
        )
        .get(empresa.id, String(sale.tipo || "").trim());
      if (row && row.pie_pegado !== undefined && row.pie_pegado !== null) {
        footerPegado = Number(row.pie_pegado) !== 0;
      }
    } catch (err) {
      /* columna ausente en bases viejas: se usa la plantilla */
    }

    const replacements = {
      "{{BODY_CLASS}}": esTicket80 ? "page page-ticket80" : "page page-a4",
      "{{PAGE_SIZE}}": esTicket80 ? "80mm auto" : "A4",
      "{{PAGE_MARGIN}}": esTicket80 ? "4mm" : "8mm",
      "{{BODY_MIN_HEIGHT}}": esTicket80 ? "0" : "281mm",
      "{{AUTO_CLOSE_SCRIPT}}": esTicket80
        ? "window.onafterprint = function(){ window.close(); };"
        : "",
      "{{BASE_FONT_FAMILY}}": fontFamily,
      "{{BASE_FONT_SIZE}}": `${fontSize || (esTicket80 ? 10 : 11)}px`,
      "{{CONTENT_WIDTH}}": esTicket80 ? "72mm" : "100%",
      "{{HEADER_COLUMNS}}": esTicket80 ? "1fr" : "1fr 60px 1.35fr",
      "{{HEADER_MIN_HEIGHT}}": esTicket80 ? "auto" : "40mm",
      "{{CLIENT_COLUMNS}}": esTicket80 ? "1fr" : "1fr 1fr",
      "{{FOOTER_COLUMNS}}": esTicket80 ? "1fr" : "minmax(0, 1fr) auto",
      "{{FOOTER_MIN_HEIGHT}}": esTicket80 || footerPegado ? "auto" : "35mm",
      "{{FOOTER_MARGIN_TOP}}": esTicket80 || footerPegado ? "6px" : "auto",
      "{{TOTALS_WIDTH}}": esTicket80 ? "100%" : "70mm",

      "{{LOGO}}": assets.logoHtml || "",
      "{{EMPRESA_NOMBRE}}": this.escape(
        nombreFantasia || empresa.razonSocial || empresa.nombre || "EMPRESA",
      ),
      "{{EMPRESA_RAZON}}": this.escape(empresa.razonSocial || ""),
      "{{EMPRESA_EMAIL}}": this.escape(empresa.email || ""),
      "{{EMPRESA_DIRECCION}}": this.escape(empresa.direccion || ""),
      "{{EMPRESA_TELEFONO}}": this.escape(empresa.telefono || ""),
      "{{EMPRESA_WHATSAPP}}": this.escape(empresa.whatsapp || ""),
      "{{EMPRESA_CUIT}}": this.escape(empresa.cuit || ""),
      "{{EMPRESA_IVA}}": this.escape(empresa.condicionIVA || ""),
      "{{EMPRESA_IIBB}}": this.escape(empresa.ingresosBrutos || ""),
      "{{EMPRESA_INICIO}}": this.escape(this.formatFecha(empresa.inicioActividad)),

      "{{VENDEDOR}}": this.escape(sale.vendedor || ""),
      "{{VENDEDOR_FOOTER}}": "",
      "{{LETRA}}": this.getLetra(sale),
      "{{CODIGO_COMPROBANTE}}": this.getCodigo(sale),
      "{{ORIGINAL}}": sale.tipo === "NOTA_X" ? "ORIGINAL 1/2" : "ORIGINAL 1/1",

      "{{TIPO_NOMBRE}}": this.escape(this.getNombreTipo(sale.tipo, sale)),
      "{{PUNTO_VENTA}}": String(sale.punto_venta).padStart(5, "0"),
      "{{NUMERO}}": String(sale.numero).padStart(8, "0"),
      "{{FECHA}}": this.escape(this.formatFechaHora(sale.fecha)),
      "{{FECHA_VENCIMIENTO}}": this.escape(this.formatFecha(sale.fecha_vencimiento)),
      "{{CONDICION_PAGO}}": this.escape(this.formatCondicion(sale.condicion_pago)),
      "{{CLIENTE_NOMBRE}}": this.escape(sale.cliente || "CONSUMIDOR FINAL"),
      "{{CLIENTE_DOC}}": this.escape(sale.cuit || sale.dni || "-"),
      "{{CLIENTE_IVA}}": this.escape(sale.condicion_iva || "CF"),
      "{{CLIENTE_DOMICILIO}}": this.escape(sale.domicilio || "SIN DIRECCION"),
      "{{CLIENTE_PROVINCIA}}": this.escape(this.formatProvincia(sale)),

      "{{ITEMS_HEADER}}": this.renderItemsHeader(sale.tipo, sale),
      "{{ITEMS}}": this.renderItems(items, sale.tipo, sale),
      "{{TOTAL_BLOCK}}": this.renderTotalBlock(sale),
      "{{CUENTA_CORRIENTE_BLOCK}}":
        sale.tipo === "FACTURA" &&
        /CUENTA_CORRIENTE/.test(String(sale.condicion_pago || "").toUpperCase())
          ? CuentaCorrienteService.renderBlock({
              empresaId: empresa.id,
              cuit: sale.cuit,
              dni: sale.dni,
            })
          : "",

      "{{FISCAL_BLOCK}}": "",
      "{{NO_FISCAL_LEGEND}}": "",
      "{{BANCO_TRANSFERENCIA}}": "",
      "{{SORTEO_BLOCK}}": "",
      "{{SIGNATURES}}": "",
      "{{DOC_RELACIONADO}}": sale.documento_origen_tipo
        ? `<div>DOCUMENTO RELACIONADO: <strong>${this.escape(sale.documento_origen_tipo)} ${String(sale.documento_origen_punto_venta || "").padStart(4, "0")}-${String(sale.documento_origen_numero || "").padStart(8, "0")}</strong></div>`
        : "",
      "{{FOOTER_TEXT}}": this.escape(pieTexto),
    };

    if (sale.tipo === "REMITO") {
      replacements["{{TOTAL_BLOCK}}"] =
        `<div class="declared-value">Valor declarado: $ ${this.money(sale.total)}</div>`;
      replacements["{{NO_FISCAL_LEGEND}}"] = sale.reserva_monto_id
        ? '<div class="legend">Retiro de reserva por monto · Documento no fiscal</div>'
        : '<div class="legend">Documento no fiscal</div>';
      replacements["{{SIGNATURES}}"] = `
        <div class="signature">
          <div class="signature-line">Entregué conforme</div>
          <div class="signature-line">Recibí conforme</div>
        </div>
      `;
    } else if (sale.cae) {
      replacements["{{FISCAL_BLOCK}}"] = await this.renderFiscalBlock({
        empresa,
        sale,
      });
    } else if (sale.tipo === "NOTA_X") {
      replacements["{{NO_FISCAL_LEGEND}}"] =
        '<div class="legend">Comprobante no válido como factura.</div>';
    } else if (sale.tipo === "PRESUPUESTO") {
      replacements["{{NO_FISCAL_LEGEND}}"] =
        '<div class="legend">Documento no válido como factura.</div>';
    } else if (sale.tipo === "NOTA_PEDIDO") {
      replacements["{{NO_FISCAL_LEGEND}}"] =
        '<div class="legend">Documento interno sujeto a confirmación.</div>';
      if (sale.vendedor) {
        replacements["{{VENDEDOR_FOOTER}}"] =
          `<div class="vendedor-footer">Vendedor: <strong>${this.escape(sale.vendedor)}</strong></div>`;
      }
    }

    if (
      sale.tipo === "FACTURA" &&
      !esTicket80 &&
      /CUENTA_CORRIENTE/.test(String(sale.condicion_pago || "").toUpperCase())
    ) {
      const bancos = db
        .prepare("SELECT nombre,titular,cuenta,cbu,alias FROM bancos WHERE empresa_id=? AND activo=1 ORDER BY id LIMIT 3")
        .all(empresa.id);
      if (bancos.length) {
        const lineas = bancos
          .map((b) => {
            const partes = [
              b.nombre ? `Banco: ${b.nombre}` : "",
              b.titular ? `Titular: ${b.titular}` : "",
              b.alias ? `Alias: ${b.alias}` : "",
              b.cbu ? `CBU: ${b.cbu}` : "",
              b.cuenta ? `Cuenta: ${b.cuenta}` : "",
            ].filter(Boolean);
            return partes.join(" · ");
          })
          .join("<br/>");
        replacements["{{BANCO_TRANSFERENCIA}}"] =
          `<div class="banco-transferencia"><strong>Datos para transferencia:</strong><br/>${lineas}</div>`;
      }
    }

    const maxItems = this.getMaxItemsPorHoja(empresa.id, plantilla);
    const paginar =
      !esTicket80 && maxItems > 0 && items.length > maxItems && sale.tipo !== "REMITO";

    if (paginar) {
      const chunks = [];

      for (let i = 0; i < items.length; i += maxItems) {
        chunks.push(items.slice(i, i + maxItems));
      }

      html = this.renderPaginated(html, chunks, replacements, sale);
    }

    for (const [key, value] of Object.entries(replacements)) {
      html = html.split(key).join(String(value ?? ""));
    }

    return html;
  }

  /*
   * Cantidad máxima de renglones por hoja en formato A4.
   * Se lee primero de la plantilla del diseñador de comprobantes
   * (afip_designer_v40) y, si no está definida, de la configuración
   * guardada en app_state (clave pos_impresion).
   * 0 o sin config: sin límite (una sola hoja).
   */
  getNombreFantasiaPuntoVenta(empresaId, puntoVenta) {
    const numero = Number(puntoVenta);

    if (!numero || !empresaId) {
      return "";
    }

    const row = db
      .prepare(
        `SELECT nombre_fantasia FROM puntos_venta
         WHERE empresa_id=? AND numero=? AND nombre_fantasia IS NOT NULL
           AND TRIM(nombre_fantasia)<>''`,
      )
      .get(empresaId, numero);

    return String(row?.nombre_fantasia || "").trim();
  }

  getMaxItemsPorHoja(empresaId, plantilla = {}) {
    if (Number(plantilla.maxItemsPorHoja) > 0) {
      return Number(plantilla.maxItemsPorHoja);
    }

    try {
      const row = db
        .prepare(
          `SELECT valor_json FROM app_state WHERE empresa_id=? AND clave='pos_impresion'`,
        )
        .get(Number(empresaId));

      const config = row ? JSON.parse(row.valor_json || "{}") : {};

      return Math.max(0, Number(config.maxItemsPorHoja || 0));
    } catch {
      return 0;
    }
  }

  /*
   * Renderiza las filas de ítems divididas en hojas cuando corresponde.
   * Cuando hay más renglones que maxItemsPorHoja (configuración POS),
   * repite el encabezado del comprobante en cada hoja y deja los totales
   * solo en la última; cada hoja indica ORIGINAL x/y.
   */
  renderPaginated(html, chunks, replacements, sale) {
    const marcador = "<!--SEC:";

    const block = (inicio, fin) =>
      html.includes(`${marcador}${inicio}`) && html.includes(`${marcador}${fin}`)
        ? html.slice(
            html.indexOf(`${marcador}${inicio}`) + `${marcador}${inicio}`.length,
            html.indexOf(`${marcador}${fin}`),
          )
        : null;

    const superior = block("SUPERIOR", "FIN-SUPERIOR");
    const detalle = block("DETALLE", "FIN-DETALLE");
    const pie = block("FOOTER", "FIN-FOOTER");

    if (!superior || !detalle || !pie) {
      return html;
    }

    const base =
      html.slice(0, html.indexOf(`${marcador}SUPERIOR`)) +
      "{{HOJAS}}" +
      html.slice(html.indexOf(`${marcador}FIN-FOOTER`) + `${marcador}FIN-FOOTER`.length);

    const hojaCss = `
      <style>
        .hoja { min-height: {{BODY_MIN_HEIGHT}}; display: flex; flex-direction: column; break-after: page; }
        .hoja:last-child { break-after: auto; }
        .hoja + .hoja { margin-top: 6mm; }
        .hoja .detail { flex: 1; }
      </style>
    `;

    const hojas = chunks
      .map((chunk, index) => {
        const esUltima = index === chunks.length - 1;
        const paginaHtml = superior
          .split("{{ORIGINAL}}")
          .join(`ORIGINAL ${index + 1}/${chunks.length}`)
          .split("{{ITEMS}}")
          .join(this.renderItems(chunk, sale.tipo, sale));

        return `<div class="hoja">${paginaHtml}${detalle
          .split("{{ITEMS}}")
          .join(this.renderItems(chunk, sale.tipo, sale))}${esUltima ? pie : ""}</div>`;
      })
      .join("");

    return base
      .split("{{HOJAS}}")
      .join(hojas)
      .replace(
        "</head>",
        hojaCss.split("{{BODY_MIN_HEIGHT}}").join(replacements["{{BODY_MIN_HEIGHT}}"] || "281mm") + "</head>",
      );
  }

  renderTotalBlock(sale) {
    const discrimina = [1, 2, 3].includes(Number(sale.comprobante_tipo_afip));
    const neto = sale.neto;
    const ivaImporte = sale.ivaImporte;
    const bruto = Number(sale.importe_bruto ?? sale.neto ?? 0);
    const descuentoPct = Number(sale.descuento_general || 0);
    const recargoPct = Number(sale.recargo_general || 0);
    const referencia = discrimina ? Number(neto) : Number(sale.total);

    let descuentoImporte = Number(sale.descuento_importe || 0);

    if (
      descuentoImporte <= 0 &&
      descuentoPct > 0 &&
      bruto > 0 &&
      Number.isFinite(referencia)
    ) {
      if (Math.abs(bruto * (1 - descuentoPct / 100) - referencia) < 0.05) {
        descuentoImporte = bruto * descuentoPct / 100;
      } else if (Number.isFinite(Number(neto)) && Math.abs(bruto - Number(neto)) < 0.05) {
        // El importe bruto almacenado ya incluye el descuento aplicado:
        // se infiere el bruto original para mostrar la rebaja real.
        const brutoOriginal = Number(neto) / (1 - descuentoPct / 100);
        descuentoImporte = brutoOriginal * descuentoPct / 100;
      }
    }

    let recargoImporte = 0;

    if (
      recargoPct > 0 &&
      bruto > 0 &&
      Number.isFinite(referencia) &&
      Math.abs(bruto * (1 + recargoPct / 100) - referencia) < 0.05
    ) {
      recargoImporte = bruto * recargoPct / 100;
    }

    const lineasAjuste =
      (descuentoImporte > 0
        ? `
          <div class="total-line">
            <span>DESCUENTO (${this.number(descuentoPct, 2)}%)</span>
            <strong>− $ ${this.money(descuentoImporte)}</strong>
          </div>
        `
        : "") +
      (recargoImporte > 0
        ? `
          <div class="total-line">
            <span>RECARGO (${this.number(recargoPct, 2)}%)</span>
            <strong>+ $ ${this.money(recargoImporte)}</strong>
          </div>
        `
        : "");

    if (discrimina && neto != null && ivaImporte != null) {
      return `
        <div class="total-discrimina">
          <div class="total-line">
            <span>NETO</span>
            <strong>$ ${this.money(neto)}</strong>
          </div>
          <div class="total-line">
            <span>IVA</span>
            <strong>$ ${this.money(ivaImporte)}</strong>
          </div>
          ${lineasAjuste}
          <div class="grand-total-row">
            <span>IMPORTE TOTAL:</span>
            <span class="grand-total">$ ${this.money(sale.totalFiscal ?? sale.total)}</span>
          </div>
        </div>
      `;
    }

    return `
      ${lineasAjuste}
      <div class="grand-total-row">
        <span>TOTAL</span>
        <span class="grand-total">$ ${this.money(sale.total)}</span>
      </div>
    `;
  }

  async renderFiscalBlock({ empresa, sale }) {
    const documento = resolverDocumentoCliente({
      cuit: sale.cuit || null,
      dni: sale.dni || null,
    });

    const qr = await QRGenerator.generateDataUrl({
      factura: { empresa },
      request: {
        puntoVenta: sale.punto_venta,
        tipoComprobante: sale.comprobante_tipo_afip,
        importeTotal: sale.total,
        docTipo: documento.docTipo,
        docNro: documento.docNro,
      },
      response: {
        numero: sale.numero,
        cae: sale.cae,
      },
    });

    const vencimiento = this.formatFecha(sale.cae_vencimiento);

    return `
      <div class="qr-block">
        <img src="${qr}" alt="QR AFIP" />
        <div class="qr-text">
          <div><strong>CAE:</strong> ${this.escape(sale.cae)}</div>
          <div><strong>Vto. CAE:</strong> ${this.escape(vencimiento)}</div>
        </div>
      </div>
    `;
  }

  renderItemsHeader(tipo, sale) {
    if (tipo === "REMITO") {
      return "<th>Cant.</th><th>Código</th><th>Producto</th>";
    }

    if ([1, 2, 3].includes(Number(sale?.comprobante_tipo_afip || 0))) {
      return "<th>Cant.</th><th>Código</th><th>Producto</th><th>P.Unit s/IVA</th><th>Sub s/IVA</th><th>Alíc.</th><th>Sub c/IVA</th>";
    }

    return "<th>Cant.</th><th>Código</th><th>Producto</th><th>Precio</th><th>Subtotal</th>";
  }

  renderItems(items, tipo, sale) {
    const esRemito = tipo === "REMITO";
    const esFacturaA = [1, 2, 3].includes(Number(sale?.comprobante_tipo_afip || 0));

    return items
      .filter((x) => !x.promocion)
      .map((x) => {
        const cantidad = Number(x.cantidad || 1);
        const precioNeto = Number(x.precio_unitario || 0);
        const descuento = Number(x.descuento || 0);
        const ivaPorc = Number(x.iva || 0);

        const neto =
          x.subtotal != null
            ? Number(x.subtotal)
            : precioNeto * cantidad * (1 - descuento / 100);

        const totalItem =
          x.total != null
            ? Number(x.total)
            : neto * (1 + ivaPorc / 100);

        const precioFinal = cantidad > 0 ? totalItem / cantidad : totalItem;
        const montoDescuento =
          descuento > 0
            ? precioNeto * cantidad * descuento / 100 * (esFacturaA ? 1 : 1 + ivaPorc / 100)
            : 0;

        const descuentoHtml =
          descuento > 0 && !esRemito
            ? `<small class="item-discount">Dto ${this.number(descuento, 2)}% (− $ ${this.money(montoDescuento)})</small>`
            : "";

        if (esFacturaA && !esRemito) {
          return `
            <tr>
              <td>${this.number(cantidad, 3)}</td>
              <td>${this.escape(x.codigo || "")}</td>
              <td>${this.escape(x.descripcion)}${descuentoHtml}</td>
              <td>$ ${this.money(precioNeto)}</td>
              <td>$ ${this.money(neto)}</td>
              <td>${this.number(ivaPorc, 2)}%</td>
              <td>$ ${this.money(totalItem)}</td>
            </tr>
          `;
        }

        return `
          <tr>
            <td>${this.number(cantidad, 3)}</td>
            <td>${this.escape(x.codigo || "")}</td>
            <td>${this.escape(x.descripcion)}${descuentoHtml}</td>
            ${
              esRemito
                ? ""
                : `
                  <td>$ ${this.money(precioFinal)}</td>
                  <td>$ ${this.money(totalItem)}</td>
                `
            }
          </tr>
        `;
      })
      .join("");
  }

  getNombreTipo(tipo, sale = null) {
    const nombres = {
      FACTURA: "FACTURA",
      NOTA_X: "NOTA DE VENTA",
      NOTA_CREDITO: "NOTA DE CRÉDITO",
      NOTA_DEBITO: "NOTA DE DÉBITO",
      REMITO: `REMITO ${sale?.subtipo || "X"}`,
      NOTA_PEDIDO: "NOTA DE PEDIDO",
      PRESUPUESTO: "PRESUPUESTO",
      RESERVA: "RESERVA",
    };

    return nombres[tipo] || tipo || "COMPROBANTE";
  }

  getLetra(sale) {
    const tipoAfip = Number(sale.comprobante_tipo_afip || 0);

    if ([1, 2, 3].includes(tipoAfip)) return "A";
    if ([6, 7, 8].includes(tipoAfip)) return "B";
    if ([11, 12, 13].includes(tipoAfip)) return "C";

    const letters = {
      NOTA_X: "X",
      REMITO: sale?.subtipo || "X",
      PRESUPUESTO: "P",
      NOTA_PEDIDO: "N",
    };

    return letters[sale.tipo] || "";
  }

  getCodigo(sale) {
    if (sale.comprobante_tipo_afip) {
      return String(sale.comprobante_tipo_afip);
    }

    return "0";
  }

  formatCondicion(value) {
    const normalized = String(value || "CONTADO").toUpperCase();

    if (normalized === "CTA_CTE" || normalized === "CUENTA_CORRIENTE") {
      return "CUENTA CORRIENTE";
    }

    if (normalized === "CONTADO") {
      return "CONTADO";
    }

    return normalized.replaceAll("_", " ");
  }

  formatProvincia(sale) {
    const localidad = sale.localidad || "";
    const provincia = sale.provincia || "";

    if (localidad && provincia) return `${localidad}/ ${provincia}`;
    if (provincia) return provincia;
    if (localidad) return localidad;
    return "/";
  }

  formatFecha(value) {
    const match = String(value || "").match(/^(\d{4})-?(\d{2})-?(\d{2})$/);

    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }

    return value ? String(value) : "-";
  }

  formatFechaHora(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value || "-");
    }

    return date.toLocaleString("es-AR");
  }

  money(value) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  number(value, decimals = 2) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

module.exports = new TicketDocumentEngine();
