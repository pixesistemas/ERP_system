const {
  getDocumentoById,
  saveDocumento,
  updateEstadoDocumento,
} = require("../repositories/documentoComercial.repository");

const {
  crearRelacion,
} = require("../repositories/documentoRelacion.repository");

const WorkflowEngine = require("../workflow/workflowEngine");

function convertirDocumento({ empresaId, documentoOrigenId, nuevoTipo, subtipo = null }) {
  const origen = getDocumentoById(documentoOrigenId);

  if (!origen) {
    const error = new Error("Documento origen no encontrado");
    error.statusCode = 404;
    throw error;
  }

  if (origen.empresa_id !== empresaId) {
    const error = new Error("No autorizado");
    error.statusCode = 403;
    throw error;
  }

  // Acá validamos si se puede convertir.
  // Ejemplo permitido: PRESUPUESTO -> FACTURA
  // Ejemplo NO permitido: FACTURA -> PRESUPUESTO
  WorkflowEngine.validateConversion(origen.tipo, nuevoTipo);

  const nuevo = saveDocumento({
    empresaId,
    clienteId: origen.cliente_id,
    vendedorId: origen.vendedor_id,
    tipo: nuevoTipo,
    estado: "BORRADOR",
    observaciones: `Generado desde ${origen.tipo} N° ${origen.punto_venta}-${origen.numero}`,
    subtipo,
    items: origen.items.map((item) => ({
      productoId: item.producto_id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      unidad: item.unidad,
      cantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      descuento: item.descuento,
      iva: item.iva,
    })),
  });

  crearRelacion({
    empresaId,
    documentoOrigenId: origen.id,
    documentoDestinoId: nuevo.id,
    tipo: `${origen.tipo}_A_${nuevoTipo}`,
  });

  const dbConv = require("../db/database");

  if (origen.tipo === "RESERVA") {
    dbConv.prepare("UPDATE stock_reservas SET estado='CONSUMIDA',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND documento_id=? AND estado='ACTIVA'").run(empresaId, origen.id);
  }

  updateEstadoDocumento({
    documentoId: origen.id,
    empresaId,
    estado: "CONFIRMADO",
  });

  return nuevo;
}

module.exports = {
  convertirDocumento,
};
