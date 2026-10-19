const fs = require("fs");
const path = require("path");
const { conNavegador } = require("./navegador");

const db = require("../db/database");
const CommercialDocumentEngine = require("../documents/engine/commercialDocumentEngine");
const TicketDocumentEngine = require("../documents/engine/ticketDocumentEngine");

const TIPOS_FISCALES = ["FACTURA", "NOTA_X", "NOTA_CREDITO", "NOTA_DEBITO"];

/*
 * Formato de hoja según la configuración de comprobantes (A4 o 80MM),
 * no según el punto de venta. Si el tipo no está configurado o el
 * formato es PUNTO_VENTA, se usa A4.
 */
function formatoImpresionDe(empresaId, tipo) {
  try {
    const row = db
      .prepare(
        `SELECT formato_impresion FROM config_comprobantes WHERE empresa_id=? AND tipo=?`,
      )
      .get(Number(empresaId), String(tipo).trim().toUpperCase());

    return String(row?.formato_impresion || "A4").toUpperCase() === "80MM"
      ? "80MM"
      : "A4";
  } catch {
    return "A4";
  }
}

class CommercialPDFService {
  async generate({ empresa, documento, cliente = null, vendedor = null }) {
    const tipo = String(documento.tipo || "").toUpperCase();

    const esFiscal = TIPOS_FISCALES.includes(tipo);

    let datosDocumento = documento;
    if (!esFiscal && documento.id) {
      try {
        const venta = db
          .prepare(
            `SELECT descuento_general,recargo_general,descuento_promociones,total
             FROM ventas_pos WHERE documento_id=? ORDER BY id DESC LIMIT 1`,
          )
          .get(documento.id);
        if (venta) {
          datosDocumento = {
            ...documento,
            recargo_general: Number(venta.recargo_general || 0),
            descuento_general: Number(documento.descuento_general ?? venta.descuento_general ?? 0),
            descuento_promociones: Number(venta.descuento_promociones || 0),
          };
        }
      } catch (error) {
        datosDocumento = documento;
      }
    }

    const html = esFiscal
      ? await this.renderFiscalHtml({ empresa, documento, cliente, vendedor })
      : CommercialDocumentEngine.render({
          empresa,
          documento: datosDocumento,
          cliente,
          vendedor,
        });

    const directory = path.join(
      process.cwd(),
      "storage",
      "pdf",
      empresa.nombre,
      "documentos",
    );

    fs.mkdirSync(directory, {
      recursive: true,
    });

    const fileName =
      `${documento.tipo}-` +
      `${String(documento.punto_venta || 1).padStart(5, "0")}-` +
      `${String(documento.numero || 0).padStart(8, "0")}.pdf`;

    const filePath = path.join(directory, fileName);

    await this.writePdf(html, filePath);

    return {
      fileName,
      filePath,
      url: `/storage/pdf/${empresa.nombre}/documentos/` + fileName,
    };
  }

  /*
   * Para documentos fiscales (facturas, NC y ND) usa el mismo motor que la
   * impresión inmediata del POS: letra, código AFIP, CAE, QR y vendedor.
   */
  async renderFiscalHtml({ empresa, documento, cliente, vendedor }) {
    let recargoGeneral = 0;
    let ventaRecargo = null;

    if (documento.id) {
      ventaRecargo = db
        .prepare(
          `SELECT recargo_general, descuento_general FROM ventas_pos WHERE documento_id=?`,
        )
        .get(documento.id);
    }

    if (ventaRecargo) {
      recargoGeneral = Number(ventaRecargo.recargo_general || 0);
    }

    const sale = {
      tipo: String(documento.tipo || "").toUpperCase(),
      punto_venta: Number(documento.punto_venta || 1),
      numero: Number(documento.numero || 0),
      fecha: documento.fecha || documento.created_at || new Date().toISOString(),
      condicion_pago: documento.condicion_venta || "CONTADO",
      cliente: cliente?.razonSocial || documento.cliente_nombre || "CONSUMIDOR FINAL",
      cuit: cliente?.cuit || documento.cliente_cuit || null,
      dni: cliente?.dni || documento.cliente_dni || null,
      condicion_iva: cliente?.condicionIVA || cliente?.condicion_iva || "CF",
      domicilio: cliente?.domicilio || "",
      localidad: cliente?.localidad || "",
      provincia: cliente?.provincia || "",
      formato_impresion: formatoImpresionDe(empresa.id, documento.tipo),
      total: Number(documento.importe_total || 0),
      cae: documento.cae || null,
      cae_vencimiento: documento.cae_vencimiento || null,
      fecha_vencimiento: documento.vencimiento || documento.cae_vencimiento || null,
      comprobante_tipo_afip: documento.comprobante_tipo_afip || null,
      neto: Number(documento.importe_neto || 0),
      ivaImporte: Number(documento.importe_iva || 0),
      totalFiscal: Number(documento.importe_total || 0),
      importe_bruto: Number(documento.importe_bruto || documento.importe_neto || 0),
      descuento_general: Number(documento.descuento_general || ventaRecargo?.descuento_general || 0),
      descuento_importe: Number(documento.descuento_importe || 0),
      recargo_general: recargoGeneral,
      vendedor: vendedor?.nombre || null,
    };

    const items = (documento.items || []).map((item) => ({
      cantidad: item.cantidad,
      codigo: item.codigo || "",
      descripcion: item.descripcion || "",
      precio_unitario: item.precio_unitario || item.precio || 0,
      iva: item.iva || 21,
      subtotal: item.subtotal != null
        ? item.subtotal
        : Number(item.precio_unitario || item.precio || 0) *
          Number(item.cantidad || 0) *
          (1 - Number(item.descuento || 0) / 100),
      total: item.total != null
        ? item.total
        : undefined,
      descuento: item.descuento || 0,
    }));

    return TicketDocumentEngine.render({ empresa, sale, items });
  }

  async writePdf(html, filePath) {
    const es80 = /class="page page-ticket80"/.test(html);
    /*
     * Para el PDF se quitan dos cosas del HTML del ticket:
     * - @page: Chrome falla con "Page.printToPDF: Printing failed" cuando
     *   el CSS trae @page con size en milímetros y "auto" (80mm auto); el
     *   tamaño del PDF se pasa por parámetros.
     * - <script>: el ticket de 80 mm trae "window.onafterprint = window.close()"
     *   para cerrar la ventanita al imprimir desde el navegador, pero al
     *   generar el PDF ese cierre ocurre durante printToPDF y Chrome falla.
     */
    const limpio = html
      .replace(/@page\s*\{[^}]*\}/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "");

    await conNavegador(async (browser) => {
      const page = await browser.newPage();

      await page.setContent(limpio, {
        waitUntil: "networkidle0",
      });

      if (es80) {
        /*
         * Alto calculado según el contenido: si se usa un alto fijo, los
         * tickets largos se cortan y algunos Chrome fallan al paginar.
         */
        let altoMm = 200;
        try {
          const altoPx = await page.evaluate(() =>
            Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0),
          );
          if (Number.isFinite(altoPx) && altoPx > 0) {
            altoMm = Math.min(1000, Math.max(120, Math.ceil((altoPx / 96) * 25.4) + 10));
          }
        } catch (error) {
          /* se usa el alto por defecto */
        }
        await page.pdf({
          path: filePath,
          width: "80mm",
          height: `${altoMm}mm`,
          printBackground: true,
          margin: {
            top: "4mm",
            right: "4mm",
            bottom: "4mm",
            left: "4mm",
          },
        });
      } else {
        await page.pdf({
          path: filePath,
          format: "A4",
          printBackground: true,
          margin: {
            top: "8mm",
            right: "8mm",
            bottom: "8mm",
            left: "8mm",
          },
        });
      }
    });
  }
}

module.exports = new CommercialPDFService();
