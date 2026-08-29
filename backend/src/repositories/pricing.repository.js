const db = require("../db/database");

function getListaByNombre({ empresaId, nombre }) {
  return db
    .prepare(
      `
    SELECT *
    FROM listas_precios
    WHERE empresa_id = ?
      AND nombre = ?
      AND activa = 1
  `,
    )
    .get(empresaId, nombre);
}

function getPrecioLista({ listaId, productoId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM lista_precio_items
    WHERE lista_id = ?
      AND producto_id = ?
  `,
    )
    .get(listaId, productoId);
}

function getDescuentoCliente({ empresaId, clienteDoc, productoId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM descuentos_cliente
    WHERE empresa_id = ?
      AND cliente_doc = ?
      AND activo = 1
      AND (producto_id = ? OR producto_id IS NULL)
    ORDER BY producto_id DESC
    LIMIT 1
  `,
    )
    .get(empresaId, String(clienteDoc), productoId);
}
function crearListaPrecio({ empresaId, nombre }) {
  db.prepare(
    `
    INSERT OR IGNORE INTO listas_precios (
      empresa_id, nombre, activa
    )
    VALUES (?, ?, 1)
  `,
  ).run(empresaId, nombre);

  return getListaByNombre({ empresaId, nombre });
}

function setPrecioLista({ listaId, productoId, precio }) {
  db.prepare(
    `
    INSERT INTO lista_precio_items (
      lista_id, producto_id, precio, updated_at
    )
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(lista_id, producto_id) DO UPDATE SET
      precio = excluded.precio,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run(listaId, productoId, Number(precio));

  return getPrecioLista({ listaId, productoId });
}

function listarListasPrecio({ empresaId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM listas_precios
    WHERE empresa_id = ?
    ORDER BY nombre
  `,
    )
    .all(empresaId);
}

function listarItemsLista({ listaId }) {
  return db
    .prepare(
      `
    SELECT 
      lpi.*,
      p.codigo,
      p.descripcion,
      p.unidad
    FROM lista_precio_items lpi
    INNER JOIN productos p ON p.id = lpi.producto_id
    WHERE lpi.lista_id = ?
    ORDER BY p.descripcion
  `,
    )
    .all(listaId);
}
function setDescuentoCliente({
  empresaId,
  clienteDoc,
  productoId = null,
  porcentaje,
}) {
  db.prepare(
    `
    INSERT INTO descuentos_cliente (
      empresa_id,
      cliente_doc,
      producto_id,
      porcentaje,
      activo
    )
    VALUES (?, ?, ?, ?, 1)
  `,
  ).run(empresaId, String(clienteDoc), productoId, Number(porcentaje));

  return {
    empresaId,
    clienteDoc,
    productoId,
    porcentaje: Number(porcentaje),
  };
}

function listarDescuentosCliente({ empresaId, clienteDoc }) {
  return db
    .prepare(
      `
    SELECT *
    FROM descuentos_cliente
    WHERE empresa_id = ?
      AND cliente_doc = ?
      AND activo = 1
    ORDER BY producto_id DESC
  `,
    )
    .all(empresaId, String(clienteDoc));
}

module.exports = {
  getListaByNombre,
  getPrecioLista,
  getDescuentoCliente,
  crearListaPrecio,
  setPrecioLista,
  listarListasPrecio,
  listarItemsLista,
  setDescuentoCliente,
  listarDescuentosCliente,
};
