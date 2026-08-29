const db = require("../db/database");

const { getNextNumero } = require("./numerador.repository");

/*
 * Redondea importes monetarios
 * a dos posiciones decimales.
 */
function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/*
 * Normaliza un porcentaje de descuento
 * y verifica que esté entre 0 y 100.
 */
function normalizeDiscount(value) {
  const numericValue = Number(value || 0);

  if (
    !Number.isFinite(numericValue) ||
    numericValue < 0 ||
    numericValue > 100
  ) {
    const error = new Error("El descuento debe estar entre 0 y 100");

    error.statusCode = 400;

    throw error;
  }

  return numericValue;
}

/*
 * Normaliza una condición de venta.
 */
function normalizeSaleCondition(value) {
  const normalized = String(value || "CONTADO")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

  const aliases = {
    CONTADO: "CONTADO",

    EFECTIVO: "CONTADO",

    CUENTA_CORRIENTE: "CUENTA_CORRIENTE",

    CUENTACORRIENTE: "CUENTA_CORRIENTE",

    CTA_CTE: "CUENTA_CORRIENTE",

    CTACTE: "CUENTA_CORRIENTE",

    CREDITO: "CUENTA_CORRIENTE",
  };

  const result = aliases[normalized];

  if (!result) {
    const error = new Error(`Condición de venta no permitida: ${value}`);

    error.statusCode = 400;

    throw error;
  }

  return result;
}

/*
 * Calcula artículos, IVA y totales
 * incluyendo descuento general.
 */
function calcularTotales(items, descuentoGeneral = 0) {
  let netoBruto = 0;
  let ivaBruto = 0;
  let totalBruto = 0;

  const itemsCalculados = items.map((item) => {
    const cantidad = Number(item.cantidad || 1);

    const precio = Number(item.precioUnitario || 0);

    const descuento = normalizeDiscount(item.descuento || 0);

    const ivaPorc = Number(item.iva || 0);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      const error = new Error(
        `Cantidad inválida para el artículo ${item.descripcion || ""}`,
      );

      error.statusCode = 400;

      throw error;
    }

    if (!Number.isFinite(precio) || precio < 0) {
      const error = new Error(
        `Precio inválido para el artículo ${item.descripcion || ""}`,
      );

      error.statusCode = 400;

      throw error;
    }

    if (!Number.isFinite(ivaPorc) || ivaPorc < 0) {
      const error = new Error(
        `IVA inválido para el artículo ${item.descripcion || ""}`,
      );

      error.statusCode = 400;

      throw error;
    }

    const bruto = cantidad * precio;

    const subtotal = bruto - (bruto * descuento) / 100;

    const ivaImporte = (subtotal * ivaPorc) / 100;

    const totalItem = subtotal + ivaImporte;

    netoBruto += subtotal;

    ivaBruto += ivaImporte;

    totalBruto += totalItem;

    return {
      ...item,

      cantidad,

      precioUnitario: roundMoney(precio),

      descuento,

      iva: ivaPorc,

      subtotal: roundMoney(subtotal),

      ivaImporte: roundMoney(ivaImporte),

      total: roundMoney(totalItem),
    };
  });

  const descuentoPorcentaje = normalizeDiscount(descuentoGeneral);

  const descuentoNeto = (netoBruto * descuentoPorcentaje) / 100;

  const descuentoIva = (ivaBruto * descuentoPorcentaje) / 100;

  const descuentoImporte = (totalBruto * descuentoPorcentaje) / 100;

  return {
    importeBruto: roundMoney(totalBruto),

    netoBruto: roundMoney(netoBruto),

    ivaBruto: roundMoney(ivaBruto),

    descuentoPorcentaje,

    descuentoNeto: roundMoney(descuentoNeto),

    descuentoIva: roundMoney(descuentoIva),

    descuentoImporte: roundMoney(descuentoImporte),

    neto: roundMoney(netoBruto - descuentoNeto),

    iva: roundMoney(ivaBruto - descuentoIva),

    total: roundMoney(totalBruto - descuentoImporte),

    items: itemsCalculados,
  };
}

/*
 * Guarda un documento comercial completo
 * mediante una transacción SQLite.
 */
function saveDocumento({
  empresaId,
  workspaceId = null,
  clienteId = null,
  vendedorId = null,
  tipo,
  estado = "BORRADOR",
  items = [],
  observaciones = null,
  puntoVenta = 1,
  condicionVenta = "CONTADO",
  listaPrecio = "GENERAL",
  descuentoGeneral = 0,
  fechaEntrega = null,
  canal = "API",
  telefonoOrigen = null,
  subtipo = null,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("Debe informar al menos un ítem");

    error.statusCode = 400;

    throw error;
  }

  const tipoNormalizado = String(tipo || "")
    .trim()
    .toUpperCase();

  const condicionNormalizada = normalizeSaleCondition(condicionVenta);

  const listaNormalizada = String(listaPrecio || "GENERAL")
    .trim()
    .toUpperCase();

  const canalNormalizado = String(canal || "API")
    .trim()
    .toUpperCase();

  const subtipoNormalizado = String(subtipo || "")
    .trim()
    .toUpperCase();
  const subtipoFinal =
    subtipoNormalizado === "R" || subtipoNormalizado === "X"
      ? subtipoNormalizado
      : tipoNormalizado === "REMITO"
        ? "X"
        : null;

  const numero = getNextNumero({
    empresaId,

    tipo: tipoNormalizado,

    puntoVenta,
  });

  const totals = calcularTotales(items, descuentoGeneral);

  const insertDocumento = db.prepare(
    `
      INSERT INTO documentos_comerciales (
        empresa_id,
        workspace_id,
        cliente_id,
        vendedor_id,
        tipo,
        estado,
        punto_venta,
        numero,
        condicion_venta,
        lista_precio,
        descuento_general,
        descuento_importe,
        importe_bruto,
        observaciones,
        fecha_entrega,
        canal,
        telefono_origen,
        subtipo,
        importe_neto,
        importe_iva,
        importe_total
      )
      VALUES (
        @empresa_id,
        @workspace_id,
        @cliente_id,
        @vendedor_id,
        @tipo,
        @estado,
        @punto_venta,
        @numero,
        @condicion_venta,
        @lista_precio,
        @descuento_general,
        @descuento_importe,
        @importe_bruto,
        @observaciones,
        @fecha_entrega,
        @canal,
        @telefono_origen,
        @subtipo,
        @importe_neto,
        @importe_iva,
        @importe_total
      )
      `,
  );

  const insertItem = db.prepare(
    `
      INSERT INTO documento_items (
        documento_id,
        producto_id,
        codigo,
        descripcion,
        unidad,
        cantidad,
        precio_unitario,
        descuento,
        iva,
        subtotal,
        iva_importe,
        total
      )
      VALUES (
        @documento_id,
        @producto_id,
        @codigo,
        @descripcion,
        @unidad,
        @cantidad,
        @precio_unitario,
        @descuento,
        @iva,
        @subtotal,
        @iva_importe,
        @total
      )
      `,
  );

  /*
   * La cabecera y todos los artículos se guardan
   * dentro de una única transacción.
   */
  const transaction = db.transaction(() => {
    const result = insertDocumento.run({
      empresa_id: empresaId,

      workspace_id: workspaceId,

      cliente_id: clienteId,

      vendedor_id: vendedorId,

      tipo: tipoNormalizado,

      estado,

      punto_venta: Number(puntoVenta || 1),

      numero,

      condicion_venta: condicionNormalizada,

      lista_precio: listaNormalizada,

      descuento_general: totals.descuentoPorcentaje,

      descuento_importe: totals.descuentoImporte,

      importe_bruto: totals.importeBruto,

      observaciones: observaciones || null,

      fecha_entrega: fechaEntrega || null,

      canal: canalNormalizado,

      telefono_origen: telefonoOrigen || null,

      subtipo: subtipoFinal,

      importe_neto: totals.neto,

      importe_iva: totals.iva,

      importe_total: totals.total,
    });

    const documentoId = result.lastInsertRowid;

    for (const item of totals.items) {
      insertItem.run({
        documento_id: documentoId,

        producto_id: item.productoId || item.producto_id || null,

        codigo: item.codigo || null,

        descripcion: item.descripcion || "SIN DESCRIPCION",

        unidad: item.unidad || "UN",

        cantidad: item.cantidad,

        precio_unitario: item.precioUnitario,

        descuento: item.descuento,

        iva: item.iva,

        subtotal: item.subtotal,

        iva_importe: item.ivaImporte,

        total: item.total,
      });
    }

    return documentoId;
  });

  return getDocumentoById(transaction());
}

/*
 * Recupera un documento completo
 * junto con todos sus artículos.
 */
function getDocumentoById(id) {
  const documento = db
    .prepare(
      `
      SELECT *
      FROM documentos_comerciales
      WHERE id = ?
      `,
    )
    .get(id);

  if (!documento) {
    return null;
  }

  const items = db
    .prepare(
      `
      SELECT *
      FROM documento_items
      WHERE documento_id = ?
      ORDER BY id
      `,
    )
    .all(id);

  return {
    ...documento,
    items,
  };
}

/*
 * Lista documentos comerciales
 * pertenecientes a una empresa.
 */
function listDocumentos({ empresaId, tipo = null }) {
  let sql = `
    SELECT
      d.*,
      c.razon_social AS cliente_nombre,
      v.nombre AS vendedor_nombre,
      (
        SELECT json_group_array(
          json_object(
            'producto_id', di.producto_id,
            'codigo', di.codigo,
            'descripcion', di.descripcion,
            'unidad', di.unidad,
            'cantidad', di.cantidad,
            'precio_unitario', di.precio_unitario,
            'descuento', di.descuento,
            'iva', di.iva,
            'subtotal', di.subtotal,
            'total', di.total
          )
        )
        FROM documento_items di
        WHERE di.documento_id = d.id
      ) AS items_json
    FROM documentos_comerciales d
    LEFT JOIN clientes c ON c.id = d.cliente_id
    LEFT JOIN vendedores v ON v.id = d.vendedor_id
    WHERE d.empresa_id = ?
  `;

  const params = [empresaId];

  if (tipo) {
    sql += `
      AND d.tipo = ?
    `;

    params.push(String(tipo).trim().toUpperCase());
  }

  sql += `
    ORDER BY d.id DESC
  `;

  return db.prepare(sql).all(...params);
}

/*
 * Actualiza el estado
 * de un documento comercial.
 */
function updateEstadoDocumento({ documentoId, empresaId, estado }) {
  const result = db
    .prepare(
      `
      UPDATE documentos_comerciales
      SET
        estado = ?,
        fecha_anulacion = CASE WHEN ? = 'ANULADO' THEN COALESCE(fecha_anulacion, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
      `,
    )
    .run(
      String(estado).trim().toUpperCase(),

      String(estado).trim().toUpperCase(),

      documentoId,
      empresaId,
    );

  const docInfo = db.prepare("SELECT canal,telefono_origen,tipo FROM documentos_comerciales WHERE id=?").get(documentoId);
  if (docInfo && docInfo.tipo === "RESERVA" && ["FACTURADO", "REMITIDO", "CONFIRMADO"].includes(String(estado).trim().toUpperCase())) {
    db.prepare("UPDATE stock_reservas SET estado='CONSUMIDA',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND documento_id=? AND estado='ACTIVA'").run(empresaId, documentoId);
  }

  if (String(estado).trim().toUpperCase() === "ANULADO") {
    db.prepare("UPDATE stock_reservas SET estado='CANCELADA',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND documento_id=? AND estado='ACTIVA'").run(empresaId, documentoId);
  }

  if (docInfo && docInfo.canal === "WHATSAPP") {
    const est = String(estado).trim().toUpperCase();
    const msgs = {
      CONFIRMADO: "¡Pedido confirmado! Lo dejamos en preparación, dale que va 👍",
      FACTURADO: "¡Listo! Tu pedido ya está facturado.",
      REMITIDO: "¡Salió para entrega! Ya va en camino a tu dirección 🚚",
      ANULADO: "Cancelamos tu pedido. Cualquier cosa, avisanos y lo reactivamos.",
    };
    db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)").run(empresaId, docInfo.telefono_origen || "", documentoId, est, msgs[est] || ("Tu pedido cambió a estado " + est + "."), "PENDIENTE");
  }

  if (result.changes === 0) {
    const error = new Error("Documento comercial no encontrado");

    error.statusCode = 404;

    throw error;
  }

  return getDocumentoById(documentoId);
}

/*
 * Guarda la ruta local y la URL
 * pública del PDF generado.
 */
function updateDocumentoPDF({ documentoId, empresaId, pdfPath, pdfUrl }) {
  const result = db
    .prepare(
      `
      UPDATE documentos_comerciales
      SET
        pdf_path = ?,
        pdf_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
      `,
    )
    .run(pdfPath, pdfUrl, documentoId, empresaId);

  if (result.changes === 0) {
    const error = new Error("No se pudo actualizar el PDF del documento");

    error.statusCode = 404;

    throw error;
  }

  return getDocumentoById(documentoId);
}

module.exports = {
  saveDocumento,
  calcularTotales,
  getDocumentoById,
  listDocumentos,
  updateEstadoDocumento,
  updateDocumentoPDF,
};
