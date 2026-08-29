const db = require("../db/database");

function getDepositoPrincipal(empresaId) {
  return db
    .prepare(
      `
    SELECT *
    FROM depositos
    WHERE empresa_id = ?
      AND activo = 1
    ORDER BY id
    LIMIT 1
  `,
    )
    .get(empresaId);
}

function getStock({ empresaId, depositoId, productoId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM stock_productos
    WHERE empresa_id = ?
      AND deposito_id = ?
      AND producto_id = ?
  `,
    )
    .get(empresaId, depositoId, productoId);
}

function asegurarStock({ empresaId, depositoId, productoId }) {
  const stock = getStock({ empresaId, depositoId, productoId });

  if (stock) return stock;

  db.prepare(
    `
    INSERT INTO stock_productos (
      empresa_id, deposito_id, producto_id, cantidad, stock_minimo, updated_at
    )
    VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
  `,
  ).run(empresaId, depositoId, productoId);

  return getStock({ empresaId, depositoId, productoId });
}

function moverStock({
  empresaId,
  depositoId,
  productoId,
  tipo,
  cantidad,
  motivo = null,
  documentoTipo = null,
  documentoId = null,
  usuarioId = null,
}) {
  const cant = Number(cantidad || 0);

  if (cant <= 0) {
    throw new Error("Cantidad de stock inválida");
  }

  asegurarStock({ empresaId, depositoId, productoId });

  const signo = tipo === "ENTRADA" ? 1 : -1;

  const transaction = db.transaction(() => {
    db.prepare(
      `
      UPDATE stock_productos
      SET cantidad = cantidad + ?, updated_at = CURRENT_TIMESTAMP
      WHERE empresa_id = ?
        AND deposito_id = ?
        AND producto_id = ?
    `,
    ).run(signo * cant, empresaId, depositoId, productoId);

    db.prepare(
      `
      INSERT INTO stock_movimientos (
        empresa_id, deposito_id, producto_id, tipo, cantidad,
        motivo, documento_tipo, documento_id, usuario_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      empresaId,
      depositoId,
      productoId,
      tipo,
      cant,
      motivo,
      documentoTipo,
      documentoId,
      usuarioId,
    );
  });

  transaction();

  return getStock({ empresaId, depositoId, productoId });
}
function getReservadoProducto({ empresaId, depositoId, productoId }) {
  const row = db
    .prepare(
      `
    SELECT IFNULL(SUM(cantidad), 0) AS reservado
    FROM stock_reservas
    WHERE empresa_id = ?
      AND deposito_id = ?
      AND producto_id = ?
      AND estado = 'ACTIVA'
  `,
    )
    .get(empresaId, depositoId, productoId);

  return Number(row?.reservado || 0);
}

function listarStock({ empresaId }) {
  const rows = db
    .prepare(
      `
    SELECT 
      sp.*,
      p.codigo,
      p.descripcion,
      p.unidad,
      d.nombre AS deposito,
      CASE WHEN sp.cantidad <= sp.stock_minimo THEN 1 ELSE 0 END AS alerta_stock
    FROM stock_productos sp
    INNER JOIN productos p ON p.id = sp.producto_id
    INNER JOIN depositos d ON d.id = sp.deposito_id
    WHERE sp.empresa_id = ?
    ORDER BY p.descripcion
  `,
    )
    .all(empresaId);

  return rows.map((row) => {
    const reservado = getReservadoProducto({
      empresaId: row.empresa_id,
      depositoId: row.deposito_id,
      productoId: row.producto_id,
    });

    return {
      ...row,
      reservado,
      disponible: Number(row.cantidad || 0) - reservado,
    };
  });
}

function listarMovimientos({ empresaId, limit = 100 }) {
  return db.prepare(`
    SELECT sm.*, p.codigo, p.codigo_barra, p.descripcion, p.unidad, d.nombre AS deposito
    FROM stock_movimientos sm
    INNER JOIN productos p ON p.id = sm.producto_id
    INNER JOIN depositos d ON d.id = sm.deposito_id
    WHERE sm.empresa_id = ?
    ORDER BY sm.id DESC
    LIMIT ?
  `).all(empresaId, Number(limit));
}

module.exports = {
  getDepositoPrincipal,
  getStock,
  asegurarStock,
  moverStock,
  listarStock,
  getReservadoProducto,
  listarMovimientos,
};
