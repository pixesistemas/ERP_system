const db = require("../db/database");
const {
  getLetraComprobante,
  getNombreComprobante,
} = require("../afip/fiscal.constants");

function saveFactura({ empresaId, request, response, origen = null }) {
  const insertFactura = db.prepare(`
    INSERT INTO facturas (
      empresa_id,
      punto_venta,
      tipo_comprobante,
      letra,
      comprobante_nombre,
      numero,
      doc_tipo,
      doc_nro,
      importe_neto,
      importe_iva,
      importe_total,
      cae,
      cae_vencimiento,
      resultado,
      request_json,
      response_json,
      documento_origen_id,
      documento_origen_tipo,
      documento_origen_punto_venta,
      documento_origen_numero
    )
    VALUES (
      @empresa_id,
      @punto_venta,
      @tipo_comprobante,
      @letra,
      @comprobante_nombre,  
      @numero,
      @doc_tipo,
      @doc_nro,
      @importe_neto,
      @importe_iva,
      @importe_total,
      @cae,
      @cae_vencimiento,
      @resultado,
      @request_json,
      @response_json,
      @documento_origen_id,
      @documento_origen_tipo,
      @documento_origen_punto_venta,
      @documento_origen_numero
    )
  `);

  const insertItem = db.prepare(`
    INSERT INTO factura_items (
      factura_id,
      codigo,
      descripcion,
      cantidad,
      precio_unitario,
      iva_porcentaje,
      subtotal,
      iva_importe,
      total
    )
    VALUES (
      @factura_id,
      @codigo,
      @descripcion,
      @cantidad,
      @precio_unitario,
      @iva_porcentaje,
      @subtotal,
      @iva_importe,
      @total
    )
  `);

  const transaction = db.transaction(() => {
    const result = insertFactura.run({
      empresa_id: empresaId,
      punto_venta: request.puntoVenta,
      tipo_comprobante: request.tipoComprobante,
      letra: getLetraComprobante(request.tipoComprobante),
      comprobante_nombre: getNombreComprobante(request.tipoComprobante),
      numero: response.numero,
      doc_tipo: request.docTipo,
      doc_nro: String(request.docNro || ""),
      importe_neto: request.importeNeto,
      importe_iva: request.importeIva,
      importe_total: request.importeTotal,
      cae: response.cae,
      cae_vencimiento: response.vencimiento,
      resultado: response.resultado,
      request_json: JSON.stringify(request),
      response_json: JSON.stringify(response.raw || response),
      documento_origen_id: origen?.id || null,
      documento_origen_tipo: origen?.tipo || null,
      documento_origen_punto_venta: origen?.puntoVenta || null,
      documento_origen_numero: origen?.numero || null,
    });

    const facturaId = result.lastInsertRowid;

    for (const item of request.items || []) {
      const cantidad = Number(item.cantidad || 1);
      const precio = Number(item.precioUnitario || 0);
      const iva = Number(item.iva || 0);

      const subtotal = cantidad * precio;
      const ivaImporte = (subtotal * iva) / 100;
      const total = subtotal + ivaImporte;

      insertItem.run({
        factura_id: facturaId,
        codigo: item.codigo || null,
        descripcion: item.descripcion || "SIN DESCRIPCION",
        cantidad,
        precio_unitario: precio,
        iva_porcentaje: iva,
        subtotal,
        iva_importe: ivaImporte,
        total,
      });
    }

    return facturaId;
  });

  const facturaId = transaction();

  return {
    ...response,
    facturaId,
  };
}

function listFacturas({ empresaId, limit = 50 }) {
  return db
    .prepare(
      `
    SELECT *
    FROM facturas
    WHERE empresa_id = ?
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(empresaId, limit);
}

function getFacturaById(id) {
  const factura = db
    .prepare(
      `
    SELECT *
    FROM facturas
    WHERE id = ?
  `,
    )
    .get(id);

  if (!factura) return null;

  const items = db
    .prepare(
      `
    SELECT *
    FROM factura_items
    WHERE factura_id = ?
    ORDER BY id
  `,
    )
    .all(id);

  return {
    ...factura,
    items,
  };
}

function updateFacturaPDF({ facturaId, pdfPath, pdfUrl }) {
  db.prepare(
    `
    UPDATE facturas
    SET
      pdf_path = ?,
      pdf_url = ?
    WHERE id = ?
  `,
  ).run(pdfPath, pdfUrl, facturaId);
}

module.exports = {
  saveFactura,
  listFacturas,
  getFacturaById,
  updateFacturaPDF,
};
