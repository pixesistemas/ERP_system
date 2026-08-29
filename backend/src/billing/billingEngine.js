const FacturaFactory = require("./factories/facturaFactory");
const { buildInvoiceRequest } = require("../afip/invoiceBuilder");
const db = require("../db/database");

const eventBus = require("../events/eventBus");
const EVENTS = require("../events/events.constants");

const PDFService = require("../pdf/pdf.service");
const { validateFacturaInput } = require("../validators/factura.validator");
const StockEngine = require("../stock/stockEngine");
const {
  saveFactura,
  updateFacturaPDF,
} = require("../repositories/factura.repository");
const {
  registrarMovimientoCC,
} = require("../repositories/clienteCuentaCorriente.repository");

const { generarComisionPorFactura } = require("../services/comision.service");
const { ejecutarReglas } = require("../services/businessRules.service");

const {
  getSaldoCliente,
} = require("../repositories/clienteCuentaCorriente.repository");

class BillingEngine {
  static async emitirFactura(data) {
    validateFacturaInput(data);
    const { factura, afip } = await FacturaFactory.create(data);

    const facturaPreparada = buildInvoiceRequest(
      factura.toInvoiceBuilderInput(),
      afip.companyConfig,
    );

    if (data.vendedorId) {
      const vendedor = db
        .prepare("SELECT nombre FROM vendedores WHERE id=? AND empresa_id=?")
        .get(data.vendedorId, factura.empresa.id);
      if (vendedor) facturaPreparada.vendedor = vendedor.nombre;
    }

    if (data.context?.documentoOrigenId) {
      facturaPreparada.documentoOrigenId = data.context.documentoOrigenId;

      facturaPreparada.documentoOrigenTipo = data.context.documentoOrigenTipo;

      facturaPreparada.documentoOrigenPuntoVenta =
        data.context.documentoOrigenPuntoVenta;

      facturaPreparada.documentoOrigenNumero =
        data.context.documentoOrigenNumero;
    }

    const deposito = StockEngine.getDepositoPrincipal(factura.empresa.id);

    StockEngine.validateAvailable({
      empresaId: factura.empresa.id,
      depositoId: deposito.id,
      items: factura.items,
    });

    const result = await afip.wsfe.createInvoice(facturaPreparada);

    facturaPreparada.condicionVenta = data.condicionVenta || "CONTADO";

    if (facturaPreparada.condicionVenta === "CTA_CTE") {
      const clienteDoc = factura.cliente.cuit || factura.cliente.dni || "0";

      const saldoCliente = getSaldoCliente({
        empresaId: factura.empresa.id,
        clienteDoc,
      });

      const warnings = ejecutarReglas({
        empresaId: factura.empresa.id,
        evento: "ANTES_FACTURAR_CTA_CTE",
        context: {
          factura,
          clienteDoc,
          saldoCliente,
          importeFactura: facturaPreparada.importeTotal,
        },
      });

      facturaPreparada.warnings = warnings;
    }

    if (result.ok) {
      const saved = saveFactura({
        empresaId: factura.empresa.id,
        request: facturaPreparada,
        response: result,

        origen: data.context?.documentoOrigenId
          ? {
              id: data.context.documentoOrigenId,
              tipo: data.context.documentoOrigenTipo,
              puntoVenta: data.context.documentoOrigenPuntoVenta,
              numero: data.context.documentoOrigenNumero,
            }
          : null,
      });

      StockEngine.consume({
        empresaId: factura.empresa.id,
        depositoId: deposito.id,
        items: factura.items,
        documentoTipo: "FACTURA",
        documentoId: saved.facturaId,
        usuarioId: data.context?.usuarioId || null,
      });

      if (facturaPreparada.condicionVenta === "CTA_CTE") {
        registrarMovimientoCC({
          empresaId: factura.empresa.id,
          clienteId: factura.cliente.id || null,
          clienteDoc: factura.cliente.cuit || factura.cliente.dni || "0",
          clienteNombre: factura.cliente.razonSocial,
          tipo: "FACTURA",
          concepto: `Factura ${facturaPreparada.tipoComprobante} ${facturaPreparada.puntoVenta}-${result.numero}`,
          debe: facturaPreparada.importeTotal,
          facturaId: saved.facturaId,
          observaciones:
            "Generado automáticamente por factura en cuenta corriente",
        });
      }
      const comision = generarComisionPorFactura({
        factura,
        saved,
        vendedorId: data.vendedorId || null,
      });

      const pdf = await PDFService.generateInvoicePDF({
        factura,
        request: facturaPreparada,
        response: result,
        saved,
      });

      result.pdf = {
        filePath: pdf.filePath,
        fileName: pdf.fileName,
        url: `/storage/pdf/${factura.empresa.nombre}/${pdf.fileName}`,
      };

      updateFacturaPDF({
        facturaId: saved.facturaId,
        pdfPath: result.pdf.filePath,
        pdfUrl: result.pdf.url,
      });

      eventBus.emitEvent(EVENTS.FACTURA_EMITIDA, {
        factura,
        request: facturaPreparada,
        response: result,
        saved,
        pdf: result.pdf,
        context: data.context || null,
        comision,
      });
      eventBus.emitEvent(EVENTS.PDF_GENERADO, {
        factura,
        request: facturaPreparada,
        response: result,
        saved,
        pdf: result.pdf,
      });
    } else {
      eventBus.emitEvent(EVENTS.FACTURA_RECHAZADA, {
        factura,
        request: facturaPreparada,
        response: result,
      });
    }
    result.warnings = facturaPreparada.warnings || [];
    return result;
  }
}

module.exports = BillingEngine;
