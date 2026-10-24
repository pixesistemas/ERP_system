const db = require("../db/database");

function numero(valor, defecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
}

function getRecepcion({ empresaId, id }) {
  const row = db
    .prepare(
      "SELECT * FROM recepciones_mercaderia WHERE id = ? AND empresa_id = ?",
    )
    .get(Number(id), Number(empresaId));
  if (!row) return null;
  const items = db
    .prepare(
      "SELECT * FROM recepcion_items WHERE recepcion_id = ? ORDER BY linea, id",
    )
    .all(row.id);
  return { ...row, items };
}

function findRecepcionByUuid({ empresaId, uuid }) {
  if (!uuid) return null;
  return db
    .prepare(
      "SELECT * FROM recepciones_mercaderia WHERE empresa_id = ? AND uuid = ?",
    )
    .get(Number(empresaId), String(uuid));
}

function listarRecepciones({ empresaId, limit = 50, estado = "" }) {
  const filtro = String(estado || "").trim().toUpperCase();
  const sql = `
    SELECT r.*,
      (SELECT COUNT(*) FROM recepcion_items i WHERE i.recepcion_id = r.id) AS items_total,
      (SELECT COUNT(*) FROM recepcion_items i WHERE i.recepcion_id = r.id AND i.estado_identificacion = 'PENDIENTE') AS items_pendientes
    FROM recepciones_mercaderia r
    WHERE r.empresa_id = ?
      ${filtro ? "AND r.estado = ?" : ""}
    ORDER BY r.id DESC
    LIMIT ?
  `;
  return db
    .prepare(sql)
    .all(
      Number(empresaId),
      ...(filtro ? [filtro] : []),
      Math.max(1, Math.min(200, Number(limit) || 50)),
    );
}

function getDeposito({ empresaId, depositoId }) {
  return db
    .prepare(
      "SELECT * FROM depositos WHERE id = ? AND empresa_id = ? AND activo = 1",
    )
    .get(Number(depositoId), Number(empresaId));
}

function getDepositoPrincipal(empresaId) {
  return db
    .prepare(
      `
      SELECT * FROM depositos
      WHERE empresa_id = ? AND activo = 1
      ORDER BY id LIMIT 1
    `,
    )
    .get(Number(empresaId));
}

function listarDepositos(empresaId) {
  return db
    .prepare(
      "SELECT id, nombre FROM depositos WHERE empresa_id = ? AND activo = 1 ORDER BY nombre",
    )
    .all(Number(empresaId));
}

function listarProveedores({ empresaId, texto = "", limit = 30 }) {
  const q = `%${String(texto || "").trim()}%`;
  return db
    .prepare(
      `
      SELECT id, nombre, cuit, condicion_iva, domicilio
      FROM proveedores
      WHERE empresa_id = ? AND activo = 1
        AND (nombre LIKE ? OR cuit LIKE ?)
      ORDER BY nombre
      LIMIT ?
    `,
    )
    .all(Number(empresaId), q, q, Math.max(1, Math.min(100, Number(limit) || 30)));
}

function getProveedor({ empresaId, proveedorId }) {
  return db
    .prepare("SELECT * FROM proveedores WHERE id = ? AND empresa_id = ?")
    .get(Number(proveedorId), Number(empresaId));
}

function findProveedor({ empresaId, documento, nombre }) {
  const doc = String(documento || "").replace(/[^\d]/g, "");
  if (doc) {
    const porDoc = db
      .prepare("SELECT * FROM proveedores WHERE empresa_id = ? AND REPLACE(REPLACE(REPLACE(cuit, '-', ''), '.', ''), ' ', '') = ?")
      .get(Number(empresaId), doc);
    if (porDoc) return porDoc;
  }
  const nombreLimpio = String(nombre || "").trim();
  if (!nombreLimpio) return null;
  return db
    .prepare(
      `
      SELECT * FROM proveedores
      WHERE empresa_id = ? AND activo = 1
        AND LOWER(TRIM(nombre)) = LOWER(?)
      ORDER BY id LIMIT 1
    `,
    )
    .get(Number(empresaId), nombreLimpio);
}

function crearDraft({ empresaId, usuarioId, data }) {
  const valores = {
    archivo_nombre: null,
    archivo_mime: null,
    archivo_path: null,
    archivo_url: null,
    ocr_json: null,
    ...Object.fromEntries(
      Object.entries(data).map(([clave, valor]) => [
        clave,
        valor === undefined || valor === null
          ? null
          : typeof valor === "boolean"
            ? (valor ? 1 : 0)
            : valor,
      ]),
    ),
  };
  const info = db
    .prepare(
      `
      INSERT INTO recepciones_mercaderia (
        empresa_id, uuid, deposito_id, origen, estado, usuario_id,
        proveedor_id, proveedor_nombre, proveedor_documento,
        proveedor_condicion_iva, proveedor_domicilio,
        tipo_comprobante, letra, punto_venta, numero, fecha,
        fecha_vencimiento, condicion_pago, moneda, cotizacion,
        crear_factura, actualizar_costo, actualizar_precio,
        costo_incluye_iva, margen_porcentaje, permitir_parcial,
        permitir_diferencia_total, observaciones, archivo_nombre,
        archivo_mime, archivo_path, archivo_url, ocr_json,
        subtotal, iva, total, total_documento, exento_no_gravado, percepciones,
        diferencia_total
      ) VALUES (
        @empresa_id, @uuid, @deposito_id, @origen, 'BORRADOR', @usuario_id,
        @proveedor_id, @proveedor_nombre, @proveedor_documento,
        @proveedor_condicion_iva, @proveedor_domicilio,
        @tipo_comprobante, @letra, @punto_venta, @numero, @fecha,
        @fecha_vencimiento, @condicion_pago, @moneda, @cotizacion,
        @crear_factura, @actualizar_costo, @actualizar_precio,
        @costo_incluye_iva, @margen_porcentaje, @permitir_parcial,
        @permitir_diferencia_total, @observaciones, @archivo_nombre,
        @archivo_mime, @archivo_path, @archivo_url, @ocr_json,
        @subtotal, @iva, @total, @total_documento, @exento_no_gravado,
        @percepciones, @diferencia_total
      )
    `,
    )
    .run(valores);
  return Number(info.lastInsertRowid);
}

function actualizarDraft({ empresaId, id, data }) {
  const row = getRecepcion({ empresaId, id });
  if (!row) {
    const error = new Error("La recepción no existe.");
    error.statusCode = 404;
    throw error;
  }
  if (row.estado !== "BORRADOR") {
    const error = new Error("Solo se puede editar una recepción en borrador.");
    error.statusCode = 409;
    throw error;
  }
  db.prepare(
    `
    UPDATE recepciones_mercaderia SET
      deposito_id = @deposito_id,
      proveedor_id = @proveedor_id,
      proveedor_nombre = @proveedor_nombre,
      proveedor_documento = @proveedor_documento,
      proveedor_condicion_iva = @proveedor_condicion_iva,
      proveedor_domicilio = @proveedor_domicilio,
      tipo_comprobante = @tipo_comprobante,
      letra = @letra,
      punto_venta = @punto_venta,
      numero = @numero,
      fecha = @fecha,
      fecha_vencimiento = @fecha_vencimiento,
      condicion_pago = @condicion_pago,
      moneda = @moneda,
      cotizacion = @cotizacion,
      crear_factura = @crear_factura,
      actualizar_costo = @actualizar_costo,
      actualizar_precio = @actualizar_precio,
      costo_incluye_iva = @costo_incluye_iva,
      margen_porcentaje = @margen_porcentaje,
      permitir_parcial = @permitir_parcial,
      permitir_diferencia_total = @permitir_diferencia_total,
      observaciones = @observaciones,
      archivo_nombre = COALESCE(@archivo_nombre, archivo_nombre),
      archivo_mime = COALESCE(@archivo_mime, archivo_mime),
      archivo_path = COALESCE(@archivo_path, archivo_path),
      archivo_url = COALESCE(@archivo_url, archivo_url),
      ocr_json = COALESCE(@ocr_json, ocr_json),
      subtotal = @subtotal,
      iva = @iva,
      total = @total,
      total_documento = @total_documento,
      exento_no_gravado = @exento_no_gravado,
      percepciones = @percepciones,
      diferencia_total = @diferencia_total,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND empresa_id = @empresa_id AND estado = 'BORRADOR'
  `,
  ).run({ ...data, id: Number(id), empresa_id: Number(empresaId) });
}

function reemplazarItems({ empresaId, recepcionId, items }) {
  const recepcion = db
    .prepare(
      "SELECT id FROM recepciones_mercaderia WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'",
    )
    .get(Number(recepcionId), Number(empresaId));
  if (!recepcion) {
    const error = new Error("Solo se pueden modificar los renglones de un borrador.");
    error.statusCode = 409;
    throw error;
  }

  const borrar = db.prepare("DELETE FROM recepcion_items WHERE recepcion_id = ?");
  const insertar = db.prepare(`
    INSERT INTO recepcion_items (
      recepcion_id, linea, producto_id, codigo, codigo_barra, descripcion,
      codigo_proveedor, cantidad_facturada, cantidad_recibida, unidad,
      costo_unitario, costo_neto, descuento, iva, importe,
      precio_venta_actual, precio_venta_nuevo, precio_venta_manual, costo_anterior,
      precio_anterior, stock_actual, estado_identificacion,
      diferencia_motivo, revisar, confianza, updated_at
    ) VALUES (
      @recepcion_id, @linea, @producto_id, @codigo, @codigo_barra, @descripcion,
      @codigo_proveedor, @cantidad_facturada, @cantidad_recibida, @unidad,
      @costo_unitario, @costo_neto, @descuento, @iva, @importe,
      @precio_venta_actual, @precio_venta_nuevo, @precio_venta_manual, @costo_anterior,
      @precio_anterior, @stock_actual, @estado_identificacion,
      @diferencia_motivo, @revisar, @confianza, CURRENT_TIMESTAMP
    )
  `);

  const tx = db.transaction(() => {
    borrar.run(Number(recepcionId));
    items.forEach((item, indice) => {
      insertar.run({
        recepcion_id: Number(recepcionId),
        linea: indice + 1,
        producto_id: item.producto_id || null,
        codigo: item.codigo || null,
        codigo_barra: item.codigo_barra || null,
        descripcion: item.descripcion || null,
        codigo_proveedor: item.codigo_proveedor || null,
        cantidad_facturada: numero(item.cantidad_facturada),
        cantidad_recibida: numero(item.cantidad_recibida),
        unidad: String(item.unidad || "UN").trim().toUpperCase().slice(0, 12) || "UN",
        costo_unitario: numero(item.costo_unitario),
        costo_neto: numero(item.costo_neto),
        descuento: numero(item.descuento),
        iva: numero(item.iva, 21),
        importe: numero(item.importe),
        precio_venta_actual: numero(item.precio_venta_actual),
        precio_venta_nuevo:
          item.precio_venta_nuevo === null || item.precio_venta_nuevo === ""
            ? null
            : numero(item.precio_venta_nuevo),
        precio_venta_manual: item.precio_venta_manual ? 1 : 0,
        costo_anterior:
          item.costo_anterior === null || item.costo_anterior === ""
            ? null
            : numero(item.costo_anterior),
        precio_anterior:
          item.precio_anterior === null || item.precio_anterior === ""
            ? null
            : numero(item.precio_anterior),
        stock_actual: numero(item.stock_actual),
        estado_identificacion: item.producto_id ? "IDENTIFICADO" : "PENDIENTE",
        diferencia_motivo: item.diferencia_motivo || null,
        revisar: item.revisar ? 1 : 0,
        confianza: item.confianza || null,
      });
    });
  });
  tx();
}

function actualizarTotales({ empresaId, id, totales }) {
  db.prepare(
    `
    UPDATE recepciones_mercaderia SET
      subtotal = ?, iva = ?, total = ?, total_documento = ?,
      diferencia_total = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'
  `,
  ).run(
    numero(totales.subtotal),
    numero(totales.iva),
    numero(totales.total),
    numero(totales.total_documento),
    numero(totales.diferencia_total),
    Number(id),
    Number(empresaId),
  );
}

function guardarOcr({ empresaId, id, ocr }) {
  db.prepare(
    `UPDATE recepciones_mercaderia SET ocr_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'`,
  ).run(JSON.stringify(ocr || null), Number(id), Number(empresaId));
}

function listarProductosBase(empresaId) {
  return db
    .prepare(
      `
      SELECT p.id, p.codigo, p.codigo_barra, p.descripcion, p.precio, p.costo,
             p.iva, p.unidad
      FROM productos p
      WHERE p.empresa_id = ? AND p.activo = 1
    `,
    )
    .all(Number(empresaId));
}

function listarCodigosBarras(empresaId) {
  return db
    .prepare(
      "SELECT producto_id, codigo_barra, cantidad FROM producto_codigos_barras WHERE empresa_id = ?",
    )
    .all(Number(empresaId));
}

function listarMapeosProveedor({ empresaId, proveedorId }) {
  if (!proveedorId) return [];
  return db
    .prepare(
      `
      SELECT pp.producto_id, pp.codigo_proveedor
      FROM producto_proveedores pp
      WHERE pp.empresa_id = ? AND pp.proveedor_id = ?
    `,
    )
    .all(Number(empresaId), Number(proveedorId));
}

function getProducto({ empresaId, productoId }) {
  return db
    .prepare("SELECT * FROM productos WHERE id = ? AND empresa_id = ?")
    .get(Number(productoId), Number(empresaId));
}

function getStock({ empresaId, depositoId, productoId }) {
  return db
    .prepare(
      `
      SELECT cantidad FROM stock_productos
      WHERE empresa_id = ? AND deposito_id = ? AND producto_id = ?
    `,
    )
    .get(Number(empresaId), Number(depositoId), Number(productoId));
}

function upsertMapeoProveedor({
  empresaId,
  productoId,
  proveedorId,
  codigoProveedor,
  costo,
}) {
  if (!productoId || !proveedorId || !String(codigoProveedor || "").trim()) return;
  db.prepare(
    `
    INSERT INTO producto_proveedores (
      empresa_id, producto_id, proveedor_id, codigo_proveedor, costo, principal
    ) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(empresa_id, producto_id, proveedor_id)
    DO UPDATE SET codigo_proveedor = excluded.codigo_proveedor, costo = excluded.costo
  `,
  ).run(
    Number(empresaId),
    Number(productoId),
    Number(proveedorId),
    String(codigoProveedor).trim(),
    numero(costo),
  );
}

function actualizarProducto({
  empresaId,
  productoId,
  costo,
  precio,
  utilidad,
  actualizarCosto,
  actualizarPrecio,
}) {
  const actual = getProducto({ empresaId, productoId });
  if (!actual) return null;
  const nuevoCosto = actualizarCosto ? numero(costo, Number(actual.costo || 0)) : Number(actual.costo || 0);
  const nuevoPrecio = actualizarPrecio
    ? numero(precio, Number(actual.precio || 0))
    : Number(actual.precio || 0);
  const nuevaUtilidad =
    utilidad === null || utilidad === undefined
      ? Number(actual.utilidad || 0)
      : numero(utilidad);
  db.prepare(
    `
    UPDATE productos SET costo = ?, precio = ?, utilidad = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND empresa_id = ?
  `,
  ).run(
    nuevoCosto,
    nuevoPrecio,
    nuevaUtilidad,
    Number(productoId),
    Number(empresaId),
  );
  return { anterior: actual, nuevo: { costo: nuevoCosto, precio: nuevoPrecio, utilidad: nuevaUtilidad } };
}

function buscarCompraDuplicada({ empresaId, tipoComprobante, puntoVenta, numero }) {
  if (!tipoComprobante || !numero) return null;
  return db
    .prepare(
      `
      SELECT id FROM compras
      WHERE empresa_id = ? AND tipo_comprobante = ? AND punto_venta = ? AND numero = ?
    `,
    )
    .get(Number(empresaId), String(tipoComprobante), Number(puntoVenta || 1), String(numero));
}

function buscarRecepcionConfirmadaDuplicada({
  empresaId,
  tipoComprobante,
  puntoVenta,
  numero,
  excluirId,
}) {
  if (!tipoComprobante || !numero) return null;
  return db
    .prepare(
      `
      SELECT id FROM recepciones_mercaderia
      WHERE empresa_id = ? AND estado = 'CONFIRMADA'
        AND tipo_comprobante = ? AND punto_venta = ? AND numero = ?
        AND id <> ?
    `,
    )
    .get(
      Number(empresaId),
      String(tipoComprobante),
      Number(puntoVenta || 1),
      String(numero),
      Number(excluirId || 0),
    );
}

function insertarCompra({ empresaId, data }) {
  const info = db
    .prepare(
      `
      INSERT INTO compras (
        empresa_id, proveedor_nombre, proveedor_documento, proveedor_domicilio,
        proveedor_condicion_iva, tipo_documento, mes_iva, anio_iva,
        tipo_comprobante, letra, punto_venta, numero, fecha,
        fecha_vencimiento, concepto, moneda, cotizacion, condicion_pago,
        rubro_gasto, observaciones, afecta_caja, neto_gravado,
        exento_no_gravado, iva_total, percepciones_retenciones, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      Number(empresaId),
      data.proveedor_nombre,
      data.proveedor_documento || "",
      data.proveedor_domicilio || "",
      data.proveedor_condicion_iva || "",
      "CUIT",
      data.mes_iva,
      data.anio_iva,
      data.tipo_comprobante,
      data.letra || "",
      Number(data.punto_venta || 1),
      String(data.numero),
      data.fecha,
      data.fecha_vencimiento || null,
      "PRODUCTOS",
      data.moneda || "PES",
      Number(data.cotizacion || 1),
      data.condicion_pago || "CONTADO",
      "",
      data.observaciones || "Generada desde Recepción de mercadería",
      data.neto_gravado,
      data.exento_no_gravado || 0,
      data.iva_total,
      data.percepciones,
      data.total,
    );
  return Number(info.lastInsertRowid);
}

function insertarIvaCompra({ compraId, detalles }) {
  const ins = db.prepare(
    "INSERT INTO compra_iva_detalles(compra_id, alicuota, neto, iva, total_con_iva) VALUES (?, ?, ?, ?, ?)",
  );
  if (!detalles.length) {
    ins.run(Number(compraId), 0, 0, 0, 0);
    return;
  }
  for (const detalle of detalles) {
    ins.run(
      Number(compraId),
      numero(detalle.alicuota),
      numero(detalle.neto),
      numero(detalle.iva),
      numero(detalle.total_con_iva),
    );
  }
}

function registrarEvento({ empresaId, recepcionId, tipo, detalle, usuarioId }) {
  db.prepare(
    `INSERT INTO recepcion_eventos(recepcion_id, empresa_id, tipo, detalle, usuario_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    Number(recepcionId),
    Number(empresaId),
    String(tipo),
    detalle ? JSON.stringify(detalle) : null,
    usuarioId ? Number(usuarioId) : null,
  );
}

function marcarConfirmada({ empresaId, id, compraId, totales, usuarioId }) {
  db.prepare(
    `
    UPDATE recepciones_mercaderia SET
      estado = 'CONFIRMADA',
      compra_id = ?,
      subtotal = ?,
      iva = ?,
      total = ?,
      total_documento = ?,
      diferencia_total = ?,
      confirmado_por = ?,
      confirmado_en = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'
  `,
  ).run(
    compraId || null,
    numero(totales.subtotal),
    numero(totales.iva),
    numero(totales.total),
    numero(totales.total_documento),
    numero(totales.diferencia_total),
    usuarioId ? Number(usuarioId) : null,
    Number(id),
    Number(empresaId),
  );
}

function marcarAnulada({ empresaId, id }) {
  const info = db
    .prepare(
      `UPDATE recepciones_mercaderia
       SET estado = 'ANULADA', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND empresa_id = ? AND estado = 'BORRADOR'`,
    )
    .run(Number(id), Number(empresaId));
  return info.changes > 0;
}

module.exports = {
  getRecepcion,
  findRecepcionByUuid,
  listarRecepciones,
  getDeposito,
  getDepositoPrincipal,
  listarDepositos,
  listarProveedores,
  getProveedor,
  findProveedor,
  crearDraft,
  actualizarDraft,
  reemplazarItems,
  actualizarTotales,
  guardarOcr,
  listarProductosBase,
  listarCodigosBarras,
  listarMapeosProveedor,
  getProducto,
  getStock,
  upsertMapeoProveedor,
  actualizarProducto,
  buscarCompraDuplicada,
  buscarRecepcionConfirmadaDuplicada,
  insertarCompra,
  insertarIvaCompra,
  registrarEvento,
  marcarConfirmada,
  marcarAnulada,
};
