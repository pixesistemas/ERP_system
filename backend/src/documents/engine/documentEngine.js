const fs = require("fs");

const TemplateResolver = require("../../pdf/engine/templateResolver");
const QRGenerator = require("../../pdf/engine/qrGenerator");
const TotalsRenderer = require("../../pdf/engine/totalsRenderer");
const TransparencyFiscalRenderer = require("../../pdf/engine/transparencyFiscalRenderer");
const CompanyAssetsLoader = require("./companyAssetsLoader");
const { getPlantillaComprobante } = require("../../repositories/empresa.repository");

class DocumentEngine {
  async renderInvoice({ factura, request, response }) {
    const templatePath = TemplateResolver.resolve({
      empresaNombre: factura.empresa.nombre,
      tipoComprobante: request.tipoComprobante,
    });

    let html = fs.readFileSync(templatePath, "utf8");

    const qr = await QRGenerator.generateDataUrl({
      factura,
      request,
      response,
    });

    const empresaAssets = CompanyAssetsLoader.load(factura.empresa, {
      puntoVenta: request.puntoVenta,
    });
    const plantilla = getPlantillaComprobante(factura.empresa.id) || {};
    const pieTexto = plantilla.pie || factura.empresa.pieFactura || "";

    const tipo = Number(request.tipoComprobante);
    const discrimina = [1, 2, 3].includes(tipo);

    const headerItems = this.renderHeaderItems(discrimina);
    const itemsHtml = this.renderItems(factura.items, discrimina);

    const fecha = new Date().toLocaleDateString("es-AR");
    const fechaVencimiento =
      this.formatDate(response.vencimiento) ||
      this.formatDate(request.fechaVencimiento) ||
      fecha;
    const fechaServDesde =
      this.formatDate(request.fechaServicioDesde) ||
      this.formatDate(request.fechaDesde) ||
      fecha;
    const fechaServHasta =
      this.formatDate(request.fechaServicioHasta) ||
      this.formatDate(request.fechaHasta) ||
      fecha;

    const replacements = {
      "{{LOGO}}": empresaAssets.logoHtml,

      "{{EMPRESA_NOMBRE}}": factura.empresa.nombre || "",
      "{{EMPRESA_RAZON}}":
        factura.empresa.razonSocial || factura.empresa.nombre || "",
      "{{EMPRESA_EMAIL}}": factura.empresa.email || "",
      "{{EMPRESA_DIRECCION}}": this.formatDireccion(factura.empresa),
      "{{EMPRESA_TELEFONO}}": factura.empresa.telefono || "",
      "{{EMPRESA_WHATSAPP}}": factura.empresa.whatsapp || "",
      "{{EMPRESA_IVA}}": factura.empresa.condicionIVA || "",
      "{{EMPRESA_CUIT}}": factura.empresa.cuit || "",
      "{{EMPRESA_IIBB}}":
        factura.empresa.ingresosBrutos || factura.empresa.cuit || "",
      "{{EMPRESA_INICIO}}": factura.empresa.inicioActividad || "",

      "{{VENDEDOR_ROW}}": request.vendedor
        ? `<div class="header-line"><strong>Vendedor:</strong> ${request.vendedor}</div>`
        : "",

      "{{LETRA}}": this.getLetra(request.tipoComprobante),
      "{{CODIGO_COMPROBANTE}}": this.getCodigo(request.tipoComprobante),
      "{{COMPROBANTE_NOMBRE}}": this.getNombre(request.tipoComprobante),
      "{{PUNTO_VENTA}}": String(request.puntoVenta).padStart(5, "0"),
      "{{NUMERO}}": String(response.numero).padStart(8, "0"),
      "{{FECHA}}": fecha,
      "{{FECHA_VENCIMIENTO}}": fechaVencimiento,
      "{{FECHA_SERV_DESDE}}": fechaServDesde,
      "{{FECHA_SERV_HASTA}}": fechaServHasta,

      "{{CLIENTE_DOC}}":
        factura.cliente.cuit || factura.cliente.dni || "00000000000",
      "{{CLIENTE_NOMBRE}}": factura.cliente.razonSocial || "CONSUMIDOR FINAL",
      "{{CLIENTE_IVA}}": factura.cliente.condicionIVA || "CF",
      "{{CLIENTE_DOMICILIO}}": factura.cliente.domicilio || "SIN DIRECCION",
      "{{CLIENTE_CONDICION_VENTA}}": this.formatCondicionVenta(
        request.condicionVenta,
      ),
      "{{CLIENTE_PROVINCIA}}": this.formatProvincia(factura.cliente),

      "{{HEADER_ITEMS}}": headerItems,
      "{{ITEMS}}": itemsHtml,

      "{{QR}}": qr,
      "{{CAE}}": response.cae || "",
      "{{CAE_VTO}}": this.formatDate(response.vencimiento) || "",

      "{{COMPROBANTE_ASOCIADO}}":
        request.documentoOrigenTipo && request.documentoOrigenNumero
          ? `
      <div class="comprobante-asociado">
        <strong>Comprobante asociado:</strong>
        ${request.documentoOrigenTipo}
        ${String(request.documentoOrigenPuntoVenta || 1).padStart(5, "0")}-
        ${String(request.documentoOrigenNumero).padStart(8, "0")}
      </div>
    `
          : "",

      "{{TOTALES}}": TotalsRenderer.render({
        request,
        ivaGrupos: request.iva || request.ivaDesglose || [],
      }),
      "{{TRANSPARENCIA_FISCAL}}": TransparencyFiscalRenderer.render({
        request,
        factura,
      }),
      "{{PIE}}": pieTexto,
    };

    for (const key in replacements) {
      html = html.replaceAll(key, replacements[key]);
    }

    return html;
  }

  renderHeaderItems(discrimina) {
    if (discrimina) {
      return `
        <tr>
          <th class="col-qty">Cantidad</th>
          <th class="col-desc">Descripción</th>
          <th class="col-code">Código</th>
          <th class="col-unit">U. Medida</th>
          <th class="col-price">P. Unitario</th>
          <th class="col-disc">% Bonf.</th>
          <th class="col-sub">SubTotal s/IVA</th>
          <th class="col-tax">Alíc.</th>
          <th class="col-subtax">SubTotal c/IVA</th>
        </tr>
      `;
    }

    return `
      <tr>
        <th class="col-qty">Cantidad</th>
        <th class="col-desc">Descripción</th>
        <th class="col-code">Código</th>
        <th class="col-unit">U. Medida</th>
        <th class="col-price">P. Unitario</th>
        <th class="col-disc">% Bonf.</th>
        <th class="col-sub">SubTotal</th>
      </tr>
    `;
  }

  renderItems(items, discrimina) {
    return items
      .map((item) => {
        const linea = `
            <tr>
              <td class="center">${item.cantidad.toFixed(3)}</td>
              <td>${item.descripcion}</td>
              <td class="center">${item.codigo || ""}</td>
              <td class="center">${item.unidad || ""}</td>
              <td class="right">$ ${this.money(item.precioUnitario)}</td>
              <td class="center">${Number(item.descuento || 0).toFixed(2)}</td>
              <td class="right">$ ${this.money(item.subtotal())}</td>
            </tr>
          `;

        if (discrimina) {
          return `
            ${linea}
            <tr class="iva-line">
              <td colspan="6"></td>
              <td class="center">IVA ${item.iva}%</td>
              <td class="center">${item.iva}%</td>
              <td class="right">$ ${this.money(item.total())}</td>
            </tr>
          `;
        }

        return linea;
      })
      .join("");
  }

  money(value) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatDate(value) {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("es-AR");
  }

  formatDireccion(empresa) {
    return [
      empresa.direccion,
      empresa.localidad,
      empresa.provincia,
      empresa.codigoPostal ? `(${empresa.codigoPostal})` : "",
    ]
      .filter(Boolean)
      .join(" - ");
  }

  formatCondicionVenta(value) {
    const normalized = String(value || "CONTADO").toUpperCase();
    if (normalized === "CTA_CTE" || normalized === "CUENTA_CORRIENTE") {
      return "CUENTA CORRIENTE";
    }
    return normalized === "CONTADO" ? "CONTADO" : normalized;
  }

  formatProvincia(cliente) {
    const localidad = cliente.localidad || "";
    const provincia = cliente.provincia || "";
    if (localidad && provincia) return `${localidad}/ ${provincia}`;
    if (provincia) return `${provincia}`;
    if (localidad) return `${localidad}`;
    return "/";
  }

  getLetra(tipo) {
    if ([1, 2, 3].includes(Number(tipo))) return "A";
    if ([6, 7, 8].includes(Number(tipo))) return "B";
    if ([11, 12, 13].includes(Number(tipo))) return "C";
    return "";
  }

  getCodigo(tipo) {
    return String(tipo);
  }

  getNombre(tipo) {
    const nombres = {
      1: "FACTURA A",
      2: "NOTA DE DÉBITO A",
      3: "NOTA DE CRÉDITO A",
      6: "FACTURA B",
      7: "NOTA DE DÉBITO B",
      8: "NOTA DE CRÉDITO B",
      11: "FACTURA C",
      12: "NOTA DE DÉBITO C",
      13: "NOTA DE CRÉDITO C",
    };

    return nombres[Number(tipo)] || "COMPROBANTE";
  }
}

module.exports = new DocumentEngine();
