const db = require("../db/database");

/*
 * Convierte una fila de SQLite
 * en un objeto de workspace.
 */
function mapWorkspace(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    empresaId: row.empresa_id,

    usuarioId: row.usuario_id,

    canal: row.canal,

    telefonoOrigen: row.telefono_origen,

    tipoOperacion: row.tipo_operacion,

    estado: row.estado,

    clienteId: row.cliente_id,

    vendedorId: row.vendedor_id,

    condicionVenta: row.condicion_venta,

    listaPrecio: row.lista_precio,

    descuentoGeneral: Number(row.descuento_general || 0),

    observaciones: row.observaciones,

    fechaEntrega: row.fecha_entrega,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

/*
 * Busca un workspace por su ID
 * junto con artículos e historial.
 */
function getWorkspaceById(id) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM workspaces
      WHERE id = ?
      `,
    )
    .get(id);

  if (!row) {
    return null;
  }

  const workspace = mapWorkspace(row);

  workspace.items = db
    .prepare(
      `
      SELECT *
      FROM workspace_items
      WHERE workspace_id = ?
      ORDER BY id
      `,
    )
    .all(id);

  workspace.timeline = db
    .prepare(
      `
      SELECT *
      FROM workspace_timeline
      WHERE workspace_id = ?
      ORDER BY id
      `,
    )
    .all(id);

  return workspace;
}

/*
 * Registra una acción dentro
 * del historial del workspace.
 */
function addTimelineEvent({
  workspaceId,
  evento,
  descripcion = null,
  datos = null,
  usuarioId = null,
}) {
  db.prepare(
    `
    INSERT INTO workspace_timeline (
      workspace_id,
      evento,
      descripcion,
      datos,
      usuario_id
    )
    VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    workspaceId,
    evento,
    descripcion,
    datos ? JSON.stringify(datos) : null,
    usuarioId,
  );
}

/*
 * Crea una operación comercial
 * nueva en estado BORRADOR.
 */
function createWorkspace({
  empresaId,
  usuarioId = null,
  canal = "API",
  telefonoOrigen = null,
  tipoOperacion,
  condicionVenta = "CONTADO",
  listaPrecio = "GENERAL",
  descuentoGeneral = 0,
  observaciones = null,
  fechaEntrega = null,
}) {
  const result = db
    .prepare(
      `
      INSERT INTO workspaces (
        empresa_id,
        usuario_id,
        canal,
        telefono_origen,
        tipo_operacion,
        estado,
        condicion_venta,
        lista_precio,
        descuento_general,
        observaciones,
        fecha_entrega
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        'BORRADOR',
        ?,
        ?,
        ?,
        ?,
        ?
      )
      `,
    )
    .run(
      empresaId,
      usuarioId,
      normalizeChannel(canal),
      normalizeNullableText(telefonoOrigen),
      normalizeRequiredText(tipoOperacion),
      normalizeSaleCondition(condicionVenta),
      normalizePriceList(listaPrecio),
      normalizeDiscount(descuentoGeneral),
      normalizeNullableText(observaciones),
      normalizeNullableText(fechaEntrega),
    );

  const workspaceId = result.lastInsertRowid;

  addTimelineEvent({
    workspaceId,

    evento: "WORKSPACE_CREADO",

    descripcion: `Workspace creado para ${tipoOperacion}`,

    datos: {
      canal: normalizeChannel(canal),

      telefonoOrigen: normalizeNullableText(telefonoOrigen),

      condicionVenta: normalizeSaleCondition(condicionVenta),

      listaPrecio: normalizePriceList(listaPrecio),
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Asigna o reemplaza el cliente
 * seleccionado en el workspace.
 */
function setWorkspaceCustomer({
  workspaceId,
  empresaId,
  clienteId,
  usuarioId = null,
}) {
  const result = db
    .prepare(
      `
      UPDATE workspaces
      SET
        cliente_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
        AND estado = 'BORRADOR'
      `,
    )
    .run(clienteId, workspaceId, empresaId);

  if (result.changes === 0) {
    const error = new Error(
      "Workspace no encontrado, no autorizado o ya confirmado",
    );

    error.statusCode = 404;

    throw error;
  }

  addTimelineEvent({
    workspaceId,

    evento: "CLIENTE_ASIGNADO",

    descripcion: `Cliente ${clienteId} asignado`,

    datos: {
      clienteId,
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Actualiza los datos comerciales
 * generales del workspace.
 */
function updateWorkspaceCommercialData({
  workspaceId,
  empresaId,
  condicionVenta = undefined,
  listaPrecio = undefined,
  descuentoGeneral = undefined,
  observaciones = undefined,
  fechaEntrega = undefined,
  canal = undefined,
  telefonoOrigen = undefined,
  tipoOperacion = undefined,
  usuarioId = null,
}) {
  const current = db
    .prepare(
      `
      SELECT *
      FROM workspaces
      WHERE id = ?
        AND empresa_id = ?
        AND estado = 'BORRADOR'
      `,
    )
    .get(workspaceId, empresaId);

  if (!current) {
    const error = new Error(
      "Workspace no encontrado, no autorizado o no editable",
    );

    error.statusCode = 404;

    throw error;
  }

  const values = {
    condicionVenta:
      condicionVenta !== undefined
        ? normalizeSaleCondition(condicionVenta)
        : current.condicion_venta,

    listaPrecio:
      listaPrecio !== undefined
        ? normalizePriceList(listaPrecio)
        : current.lista_precio,

    descuentoGeneral:
      descuentoGeneral !== undefined
        ? normalizeDiscount(descuentoGeneral)
        : Number(current.descuento_general || 0),

    observaciones:
      observaciones !== undefined
        ? normalizeNullableText(observaciones)
        : current.observaciones,

    fechaEntrega:
      fechaEntrega !== undefined
        ? normalizeNullableText(fechaEntrega)
        : current.fecha_entrega,

    canal: canal !== undefined ? normalizeChannel(canal) : current.canal,

    telefonoOrigen:
      telefonoOrigen !== undefined
        ? normalizeNullableText(telefonoOrigen)
        : current.telefono_origen,

    tipoOperacion:
      tipoOperacion !== undefined
        ? String(tipoOperacion).toUpperCase()
        : current.tipo_operacion,
  };

  const result = db
    .prepare(
      `
      UPDATE workspaces
      SET
        condicion_venta = ?,
        lista_precio = ?,
        descuento_general = ?,
        observaciones = ?,
        fecha_entrega = ?,
        canal = ?,
        telefono_origen = ?,
        tipo_operacion = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
        AND estado = 'BORRADOR'
      `,
    )
    .run(
      values.condicionVenta,
      values.listaPrecio,
      values.descuentoGeneral,
      values.observaciones,
      values.fechaEntrega,
      values.canal,
      values.telefonoOrigen,
      values.tipoOperacion,
      workspaceId,
      empresaId,
    );

  if (result.changes === 0) {
    const error = new Error(
      "No fue posible actualizar los datos comerciales del workspace",
    );

    error.statusCode = 400;

    throw error;
  }

  addTimelineEvent({
    workspaceId,

    evento: "DATOS_COMERCIALES_ACTUALIZADOS",

    descripcion: "Datos comerciales actualizados",

    datos: values,

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Agrega un artículo al workspace
 * y calcula todos sus importes.
 */
function addWorkspaceItem({
  workspaceId,
  productoId = null,
  codigo = null,
  descripcion,
  unidad = "UN",
  cantidad = 1,
  precioUnitario = 0,
  descuento = 0,
  iva = 21,
  usuarioId = null,
}) {
  const cantidadNumero = Number(cantidad || 0);

  const precioNumero = Number(precioUnitario || 0);

  const descuentoNumero = normalizeDiscount(descuento);

  const ivaNumero = Number(iva || 0);

  if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
    const error = new Error("La cantidad debe ser mayor a cero");

    error.statusCode = 400;

    throw error;
  }

  if (!Number.isFinite(precioNumero) || precioNumero < 0) {
    const error = new Error("El precio unitario no es válido");

    error.statusCode = 400;

    throw error;
  }

  if (!Number.isFinite(ivaNumero) || ivaNumero < 0) {
    const error = new Error("El porcentaje de IVA no es válido");

    error.statusCode = 400;

    throw error;
  }

  const bruto = cantidadNumero * precioNumero;

  const subtotal = bruto - (bruto * descuentoNumero) / 100;

  const ivaImporte = (subtotal * ivaNumero) / 100;

  const total = subtotal + ivaImporte;

  const result = db
    .prepare(
      `
      INSERT INTO workspace_items (
        workspace_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      workspaceId,
      productoId,
      codigo,
      descripcion,
      unidad,
      cantidadNumero,
      roundMoney(precioNumero),
      descuentoNumero,
      ivaNumero,
      roundMoney(subtotal),
      roundMoney(ivaImporte),
      roundMoney(total),
    );

  addTimelineEvent({
    workspaceId,

    evento: "ITEM_AGREGADO",

    descripcion: `${cantidadNumero} x ${descripcion}`,

    datos: {
      itemId: result.lastInsertRowid,

      productoId,

      cantidad: cantidadNumero,

      descuento: descuentoNumero,

      total: roundMoney(total),
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Actualiza cantidad o descuento
 * de un artículo existente.
 */
function updateWorkspaceItem({
  workspaceId,
  itemId,
  cantidad,
  descuento,
  usuarioId = null,
}) {
  const item = db
    .prepare(
      `
      SELECT *
      FROM workspace_items
      WHERE id = ?
        AND workspace_id = ?
      `,
    )
    .get(itemId, workspaceId);

  if (!item) {
    const error = new Error("Artículo del workspace no encontrado");

    error.statusCode = 404;

    throw error;
  }

  const cantidadNumero =
    cantidad !== undefined && cantidad !== null
      ? Number(cantidad)
      : Number(item.cantidad);

  const descuentoNumero =
    descuento !== undefined && descuento !== null
      ? normalizeDiscount(descuento)
      : Number(item.descuento || 0);

  if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
    const error = new Error("La cantidad debe ser mayor a cero");

    error.statusCode = 400;

    throw error;
  }

  const precioUnitario = Number(item.precio_unitario || 0);

  const iva = Number(item.iva || 0);

  const bruto = cantidadNumero * precioUnitario;

  const subtotal = bruto - (bruto * descuentoNumero) / 100;

  const ivaImporte = (subtotal * iva) / 100;

  const total = subtotal + ivaImporte;

  db.prepare(
    `
    UPDATE workspace_items
    SET
      cantidad = ?,
      descuento = ?,
      subtotal = ?,
      iva_importe = ?,
      total = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND workspace_id = ?
    `,
  ).run(
    cantidadNumero,
    descuentoNumero,
    roundMoney(subtotal),
    roundMoney(ivaImporte),
    roundMoney(total),
    itemId,
    workspaceId,
  );

  addTimelineEvent({
    workspaceId,

    evento: "ITEM_ACTUALIZADO",

    descripcion: `${item.descripcion}: cantidad ${cantidadNumero}, descuento ${descuentoNumero}%`,

    datos: {
      itemId,
      cantidad: cantidadNumero,
      descuento: descuentoNumero,
      total: roundMoney(total),
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Elimina un artículo
 * existente del workspace.
 */
function deleteWorkspaceItem({ workspaceId, itemId, usuarioId = null }) {
  const item = db
    .prepare(
      `
      SELECT *
      FROM workspace_items
      WHERE id = ?
        AND workspace_id = ?
      `,
    )
    .get(itemId, workspaceId);

  if (!item) {
    const error = new Error("Artículo del workspace no encontrado");

    error.statusCode = 404;

    throw error;
  }

  db.prepare(
    `
    DELETE FROM workspace_items
    WHERE id = ?
      AND workspace_id = ?
    `,
  ).run(itemId, workspaceId);

  addTimelineEvent({
    workspaceId,

    evento: "ITEM_ELIMINADO",

    descripcion: `Artículo eliminado: ${item.descripcion}`,

    datos: {
      itemId,

      productoId: item.producto_id,
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Cambia el estado
 * general del workspace.
 */
function updateWorkspaceStatus({
  workspaceId,
  empresaId,
  estado,
  usuarioId = null,
}) {
  const normalizedStatus = normalizeRequiredText(estado).toUpperCase();

  const result = db
    .prepare(
      `
      UPDATE workspaces
      SET
        estado = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
      `,
    )
    .run(normalizedStatus, workspaceId, empresaId);

  if (result.changes === 0) {
    const error = new Error("Workspace no encontrado");

    error.statusCode = 404;

    throw error;
  }

  addTimelineEvent({
    workspaceId,

    evento: "ESTADO_CAMBIADO",

    descripcion: `Estado cambiado a ${normalizedStatus}`,

    datos: {
      estado: normalizedStatus,
    },

    usuarioId,
  });

  return getWorkspaceById(workspaceId);
}

/*
 * Lista los workspaces de una empresa,
 * opcionalmente filtrados por estado.
 */
function listWorkspaces({ empresaId, estado = null, limit = 50 }) {
  let sql = `
    SELECT *
    FROM workspaces
    WHERE empresa_id = ?
  `;

  const params = [empresaId];

  if (estado) {
    sql += `
      AND estado = ?
    `;

    params.push(String(estado).trim().toUpperCase());
  }

  sql += `
    ORDER BY id DESC
    LIMIT ?
  `;

  params.push(Number(limit || 50));

  return db
    .prepare(sql)
    .all(...params)
    .map(mapWorkspace);
}

/*
 * Normaliza una condición
 * de venta comercial.
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

    CASH: "CONTADO",

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
 * Normaliza el porcentaje
 * de descuento.
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
 * Normaliza el nombre
 * de la lista de precios.
 */
function normalizePriceList(value) {
  return (
    String(value || "GENERAL")
      .trim()
      .toUpperCase() || "GENERAL"
  );
}

/*
 * Normaliza el canal de origen.
 */
function normalizeChannel(value) {
  return (
    String(value || "API")
      .trim()
      .toUpperCase() || "API"
  );
}

/*
 * Normaliza texto obligatorio.
 */
function normalizeRequiredText(value) {
  const text = String(value || "").trim();

  if (!text) {
    const error = new Error("Se recibió un texto obligatorio vacío");

    error.statusCode = 400;

    throw error;
  }

  return text;
}

/*
 * Normaliza un texto opcional.
 */
function normalizeNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value).trim() || null;
}

/*
 * Redondea un valor monetario
 * a dos decimales.
 */
function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  createWorkspace,
  getWorkspaceById,
  setWorkspaceCustomer,
  updateWorkspaceCommercialData,
  addWorkspaceItem,
  updateWorkspaceItem,
  deleteWorkspaceItem,
  updateWorkspaceStatus,
  listWorkspaces,
  addTimelineEvent,
};
