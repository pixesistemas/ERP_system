const db = require("../db/database");

function getSaldoCliente({ empresaId, clienteDoc }) {
  const row = db
    .prepare(
      `
    SELECT IFNULL(SUM(debe), 0) - IFNULL(SUM(haber), 0) AS saldo
    FROM cliente_cc_movimientos
    WHERE empresa_id = ?
      AND cliente_doc = ?
  `,
    )
    .get(empresaId, String(clienteDoc));

  return row ? Number(row.saldo) : 0;
}

function registrarMovimientoCC({
  empresaId,
  clienteId = null,
  clienteDoc,
  clienteNombre,
  tipo,
  concepto,
  debe = 0,
  haber = 0,
  facturaId = null,
  documentoId = null,
  observaciones = null,
}) {
  const saldoAnterior = getSaldoCliente({
    empresaId,
    clienteDoc,
  });

  const saldoNuevo =
    Number(saldoAnterior) + Number(debe || 0) - Number(haber || 0);

  const result = db
    .prepare(
      `
    INSERT INTO cliente_cc_movimientos (
      empresa_id,
      cliente_id,
      cliente_doc,
      cliente_nombre,
      tipo,
      concepto,
      debe,
      haber,
      saldo,
      factura_id,
      documento_id,
      observaciones
    )
    VALUES (
      @empresa_id,
      @cliente_id,
      @cliente_doc,
      @cliente_nombre,
      @tipo,
      @concepto,
      @debe,
      @haber,
      @saldo,
      @factura_id,
      @documento_id,
      @observaciones
    )
  `,
    )
    .run({
      empresa_id: empresaId,
      cliente_id: clienteId,
      cliente_doc: String(clienteDoc),
      cliente_nombre: clienteNombre,
      tipo,
      concepto,
      debe: Number(debe || 0),
      haber: Number(haber || 0),
      saldo: saldoNuevo,
      factura_id: facturaId,
      documento_id: documentoId,
      observaciones,
    });

  return getMovimientoById(result.lastInsertRowid);
}

function getMovimientoById(id) {
  return db
    .prepare(
      `
    SELECT *
    FROM cliente_cc_movimientos
    WHERE id = ?
  `,
    )
    .get(id);
}

function listarMovimientosCliente({ empresaId, clienteDoc }) {
  return db
    .prepare(
      `
    SELECT *
    FROM cliente_cc_movimientos
    WHERE empresa_id = ?
      AND cliente_doc = ?
    ORDER BY id DESC
  `,
    )
    .all(empresaId, String(clienteDoc));
}

module.exports = {
  getSaldoCliente,
  registrarMovimientoCC,
  listarMovimientosCliente,
};
