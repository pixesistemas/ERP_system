const BillingEngine = require("../billing/billingEngine");

const {
  getDocumentoById,
  updateEstadoDocumento,
} = require("../repositories/documentoComercial.repository");

const {
  crearRelacion,
} = require("../repositories/documentoRelacion.repository");

const { getClienteById } = require("../repositories/cliente.repository");

const WorkflowEngine = require("../workflow/workflowEngine");

async function facturarDocumento({
  empresaId,
  empresaNombre,
  documentoId,
  condicionVenta = "CONTADO",
  context = null,
}) {
  const documento = getDocumentoById(documentoId);

  if (!documento) {
    const error = new Error("Documento comercial no encontrado");
    error.statusCode = 404;
    throw error;
  }

  if (Number(documento.empresa_id) !== Number(empresaId)) {
    const error = new Error("No autorizado para facturar este documento");
    error.statusCode = 403;
    throw error;
  }

  if (documento.estado === "FACTURADO") {
    const error = new Error("El documento ya fue facturado");
    error.statusCode = 409;
    throw error;
  }

  WorkflowEngine.validateConversion(documento.tipo, "FACTURA");

  if (!documento.cliente_id) {
    const error = new Error("El documento no tiene un cliente asociado");
    error.statusCode = 400;
    throw error;
  }

  const cliente = getClienteById(documento.cliente_id);

  if (!cliente) {
    const error = new Error("No se encontró el cliente asociado al documento");
    error.statusCode = 404;
    throw error;
  }

  if (!Array.isArray(documento.items) || documento.items.length === 0) {
    const error = new Error("El documento no contiene ítems");
    error.statusCode = 400;
    throw error;
  }

  const billingPayload = {
    empresa: empresaNombre,
    vendedorId: documento.vendedor_id || null,
    condicionVenta,
    listaPrecio: "GENERAL",

    cliente: {
      id: cliente.id,
      cuit: cliente.cuit || null,
      dni: cliente.dni || null,
      razonSocial:
        cliente.razonSocial || cliente.razon_social || cliente.nombre || null,
      condicionIVA: cliente.condicionIVA || cliente.condicion_iva || "CF",
      domicilio: cliente.domicilio || cliente.direccion || "",
    },

    items: documento.items.map((item) => ({
      productoId: item.producto_id || null,
      codigo: item.codigo || null,
      descripcion: item.descripcion,
      unidad: item.unidad || "UN",
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precio_unitario),
      descuento: Number(item.descuento || 0),
      iva: Number(item.iva || 0),
    })),

    context: {
      ...(context || {}),

      documentoOrigenId: documento.id,
      documentoOrigenTipo: documento.tipo,
      documentoOrigenPuntoVenta: documento.punto_venta,
      documentoOrigenNumero: documento.numero,
    },
  };

  const resultado = await BillingEngine.emitirFactura(billingPayload);

  if (!resultado.ok) {
    return {
      ok: false,
      documento,
      facturacion: resultado,
    };
  }

  /*
   * BillingEngine debería devolver saved.facturaId o facturaId.
   * Usamos ambas posibilidades para mantener compatibilidad.
   */
  const facturaId = resultado.facturaId || resultado.saved?.facturaId || null;

  if (facturaId) {
    /*
    crearRelacion({
      empresaId,
      documentoOrigenId: documento.id,
      documentoDestinoId: facturaId,
      tipo: `${documento.tipo}_A_FACTURA`,
      observaciones:
        `Documento facturado como comprobante ` + `${resultado.numero}`,
    });
    */
  }

  updateEstadoDocumento({
    documentoId: documento.id,
    empresaId,
    estado: "FACTURADO",
  });

  return {
    ok: true,
    documentoOrigen: {
      id: documento.id,
      tipo: documento.tipo,
      puntoVenta: documento.punto_venta,
      numero: documento.numero,
    },
    factura: resultado,
  };
}

module.exports = {
  facturarDocumento,
};
