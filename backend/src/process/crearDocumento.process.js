const {
  saveDocumento,
} = require("../repositories/documentoComercial.repository");

const { generarPDFDocumento } = require("../services/documentoPdf.service");

const { getEmpresaByNombre } = require("../repositories/empresa.repository");

const db = require("../db/database");

/*
 * Tipos comerciales que pueden crearse
 * mediante este proceso genérico.
 */
const TIPOS_PERMITIDOS = ["NOTA_PEDIDO", "PRESUPUESTO", "REMITO", "NOTA_CREDITO"];

/*
 * Deja una operación PENDIENTE en el punto de venta para los documentos
 * generados por chat (presupuestos y notas de pedido). Así aparecen en el
 * panel del cliente del POS, pueden cargarse a la grilla y facturarse con
 * CAE desde ahí. La venta pendiente queda vinculada al documento para que,
 * al confirmarse o anularse, el documento BORRADOR siga el mismo estado.
 */
function registrarPendientePos({ empresaId, documento }) {
  const tipo = documento.tipo;

  if (!["PRESUPUESTO", "NOTA_PEDIDO"].includes(tipo)) return null;

  const subtotal = Number(documento.importe_neto || 0);

  const total = Number(documento.importe_total || subtotal);

  const configRow = db
    .prepare(
      `SELECT formato_impresion FROM config_comprobantes WHERE empresa_id=? AND tipo=?`,
    )
    .get(empresaId, tipo);

  const formatoImpresion =
    String(configRow?.formato_impresion || "A4").toUpperCase() === "80MM"
      ? "80MM"
      : "A4";

  const tx = db.transaction(() => {
    const sale = db
      .prepare(
        `INSERT INTO ventas_pos(empresa_id,sucursal_id,cajero_id,caja_sesion_id,cliente_id,vendedor_id,punto_venta,numero,tipo,estado,condicion_pago,observaciones,subtotal,descuento_general,recargo_general,descuento_promociones,total,vuelto,documento_id,reserva_monto_id,formato_impresion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        empresaId,
        null,
        null,
        null,
        documento.cliente_id || null,
        documento.vendedor_id || null,
        Number(documento.punto_venta || 1),
        Number(documento.numero || 0),
        tipo,
        "PENDIENTE",
        documento.condicion_venta || "CONTADO",
        documento.observaciones || null,
        subtotal,
        Number(documento.descuento_general || 0),
        0,
        0,
        total,
        0,
        documento.id,
        null,
        formatoImpresion,
      );

    const insItem = db.prepare(
      "INSERT INTO venta_pos_items(venta_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,costo_unitario,subtotal,promocion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    );

    for (const x of documento.items || []) {
      const line =
        Number(x.precio_unitario || x.precioUnitario || 0) *
        Number(x.cantidad || 0) *
        (1 - Number(x.descuento || 0) / 100);

      insItem.run(
        sale.lastInsertRowid,
        x.producto_id || null,
        x.codigo || "",
        x.descripcion,
        x.unidad || "UN",
        Number(x.cantidad),
        Number(x.precio_unitario || x.precioUnitario || 0),
        Number(x.descuento || 0),
        Number(x.iva || 21),
        0,
        Math.round(line * 100) / 100,
        0,
      );
    }

    return sale.lastInsertRowid;
  });

  return tx();
}

/*
 * Crea un documento comercial, guarda sus artículos
 * y genera inmediatamente el archivo PDF.
 */
async function crearDocumentoProcess(payload = {}) {
  const tipo = String(payload.tipo || "")
    .trim()
    .toUpperCase();

  const empresaNombre = String(
    payload.empresa ||
      payload.empresaNombre ||
      payload.context?.empresa ||
      payload.context?.empresaNombre ||
      "",
  ).trim();

  const empresaId = Number(
    payload.context?.empresaId || payload.empresaId || 0,
  );

  const workspaceId =
    payload.workspaceId || payload.context?.workspaceId || null;

  /*
   * Valida que el tipo corresponda a un
   * documento comercial permitido.
   */
  if (!TIPOS_PERMITIDOS.includes(tipo)) {
    const error = new Error(`Tipo de documento no permitido: ${tipo}`);

    error.statusCode = 400;

    throw error;
  }

  /*
   * Valida el nombre utilizado para recuperar
   * la configuración completa de la empresa.
   */
  if (!empresaNombre) {
    const error = new Error(
      "No se recibió la empresa para crear el documento.",
    );

    error.statusCode = 400;

    error.details = {
      empresaId: empresaId || null,

      tipo,
    };

    throw error;
  }

  /*
   * Valida la empresa numérica asociada
   * al documento persistido.
   */
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    const error = new Error("No se recibió un empresaId válido.");

    error.statusCode = 400;

    error.details = {
      empresaNombre,
      tipo,
    };

    throw error;
  }

  /*
   * Todo documento debe tener
   * al menos un artículo.
   */
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    const error = new Error("Debe informar al menos un ítem");

    error.statusCode = 400;

    throw error;
  }

  /*
   * Recupera los datos de la empresa que luego
   * serán utilizados en el PDF.
   */
  const empresa = getEmpresaByNombre(empresaNombre);

  if (!empresa) {
    const error = new Error(`Empresa no encontrada: ${empresaNombre}`);

    error.statusCode = 404;

    throw error;
  }

  /*
   * Persiste el documento comercial
   * con todos los datos del workspace.
   */
  const documento = saveDocumento({
    empresaId,

    workspaceId,

    clienteId: payload.clienteId || null,

    vendedorId: payload.vendedorId || null,

    tipo,

    estado: payload.estado || "BORRADOR",

    puntoVenta: payload.puntoVenta || 1,

    condicionVenta: payload.condicionVenta || "CONTADO",

    listaPrecio: payload.listaPrecio || "GENERAL",

    descuentoGeneral: payload.descuentoGeneral || 0,

    observaciones: payload.observaciones || null,

    fechaEntrega: payload.fechaEntrega || null,

    canal: payload.canal || payload.context?.canal || "API",

    telefonoOrigen:
      payload.telefonoOrigen || payload.context?.telefonoOrigen || null,

    subtipo: payload.subtipo || null,

    items: payload.items,
  });

  /*
   * Presupuestos y notas de pedido del chat quedan PENDIENTES en el POS
   * para poder cargarlos a la grilla y facturarlos desde el punto de venta.
   */
  const ventaPendienteId = registrarPendientePos({ empresaId, documento });

  /*
   * Genera el PDF luego de guardar
   * correctamente cabecera e ítems.
   */
  const pdfResult = await generarPDFDocumento({
    empresa,

    documentoId: documento.id,
  });

  return {
    documento: pdfResult.documento,

    pdf: pdfResult.pdf,

    ventaPendienteId,
  };
}

module.exports = crearDocumentoProcess;
