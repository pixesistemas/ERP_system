const db = require("../db/database");

function crearReserva({
  empresaId,
  depositoId,
  productoId,
  cantidad,
  documentoTipo = null,
  documentoId = null,
  observaciones = null,
  usuarioId = null,
}) {
  const result = db
    .prepare(
      `
    INSERT INTO stock_reservas (
      empresa_id, deposito_id, producto_id,
      documento_tipo, documento_id,
      cantidad, estado, observaciones, usuario_id
    )
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVA', ?, ?)
  `,
    )
    .run(
      empresaId,
      depositoId,
      productoId,
      documentoTipo,
      documentoId,
      Number(cantidad),
      observaciones,
      usuarioId,
    );

  return getReservaById(result.lastInsertRowid);
}

function getReservaById(id) {
  return db
    .prepare(
      `
    SELECT *
    FROM stock_reservas
    WHERE id = ?
  `,
    )
    .get(id);
}

function listarReservas({ empresaId, estado = "ACTIVA" }) {
  return db
    .prepare(
      `
    SELECT 
      r.*,
      p.codigo,
      p.descripcion,
      d.nombre AS deposito
    FROM stock_reservas r
    INNER JOIN productos p ON p.id = r.producto_id
    INNER JOIN depositos d ON d.id = r.deposito_id
    WHERE r.empresa_id = ?
      AND r.estado = ?
    ORDER BY r.id DESC
  `,
    )
    .all(empresaId, estado);
}

function cancelarReserva({ reservaId, empresaId }) {
  db.prepare(
    `
    UPDATE stock_reservas
    SET estado = 'CANCELADA',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND empresa_id = ?
      AND estado = 'ACTIVA'
  `,
  ).run(reservaId, empresaId);

  return getReservaById(reservaId);
}

function consumirReserva({ reservaId, empresaId }) {
  db.prepare(
    `
    UPDATE stock_reservas
    SET estado = 'CONSUMIDA',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND empresa_id = ?
      AND estado = 'ACTIVA'
  `,
  ).run(reservaId, empresaId);

  return getReservaById(reservaId);
}

module.exports = {
  crearReserva,
  getReservaById,
  listarReservas,
  cancelarReserva,
  consumirReserva,
};
