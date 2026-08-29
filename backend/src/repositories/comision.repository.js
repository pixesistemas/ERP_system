const db = require("../db/database");

function registrarComision({
  empresaId,
  vendedorId,
  origenTipo,
  origenId = null,
  clienteDoc = null,
  clienteNombre = null,
  baseCalculo,
  porcentaje,
  observaciones = null,
}) {
  const importe = (Number(baseCalculo || 0) * Number(porcentaje || 0)) / 100;

  const result = db
    .prepare(
      `
    INSERT INTO vendedor_comisiones (
      empresa_id,
      vendedor_id,
      origen_tipo,
      origen_id,
      cliente_doc,
      cliente_nombre,
      base_calculo,
      porcentaje,
      importe,
      estado,
      observaciones
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
  `,
    )
    .run(
      empresaId,
      vendedorId,
      origenTipo,
      origenId,
      clienteDoc,
      clienteNombre,
      Number(baseCalculo || 0),
      Number(porcentaje || 0),
      importe,
      observaciones,
    );

  return getComisionById(result.lastInsertRowid);
}

function getComisionById(id) {
  return db
    .prepare(
      `
    SELECT *
    FROM vendedor_comisiones
    WHERE id = ?
  `,
    )
    .get(id);
}

function listarComisiones({ empresaId, vendedorId = null }) {
  let sql = `
    SELECT 
      vc.*,
      v.nombre AS vendedor_nombre
    FROM vendedor_comisiones vc
    INNER JOIN vendedores v ON v.id = vc.vendedor_id
    WHERE vc.empresa_id = ?
  `;

  const params = [empresaId];

  if (vendedorId) {
    sql += ` AND vc.vendedor_id = ?`;
    params.push(vendedorId);
  }

  sql += ` ORDER BY vc.id DESC`;

  return db.prepare(sql).all(...params);
}
function liquidarComisiones({
  empresaId,
  vendedorId,
  usuarioId = null,
  observaciones = null,
}) {
  const pendientes = db
    .prepare(
      `
    SELECT *
    FROM vendedor_comisiones
    WHERE empresa_id = ?
      AND vendedor_id = ?
      AND estado = 'PENDIENTE'
  `,
    )
    .all(empresaId, vendedorId);

  const total = pendientes.reduce((sum, c) => sum + Number(c.importe || 0), 0);

  if (pendientes.length === 0) {
    return {
      liquidacion: null,
      total: 0,
      comisiones: [],
    };
  }

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO vendedor_liquidaciones (
        empresa_id,
        vendedor_id,
        importe_total,
        observaciones,
        usuario_id
      )
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(empresaId, vendedorId, total, observaciones, usuarioId);

    const liquidacionId = result.lastInsertRowid;

    db.prepare(
      `
      UPDATE vendedor_comisiones
      SET estado = 'LIQUIDADA'
      WHERE empresa_id = ?
        AND vendedor_id = ?
        AND estado = 'PENDIENTE'
    `,
    ).run(empresaId, vendedorId);

    return liquidacionId;
  });

  const liquidacionId = transaction();

  return {
    liquidacion: db
      .prepare(
        `
      SELECT *
      FROM vendedor_liquidaciones
      WHERE id = ?
    `,
      )
      .get(liquidacionId),
    total,
    comisiones: pendientes,
  };
}

function listarLiquidaciones({ empresaId, vendedorId = null }) {
  let sql = `
    SELECT 
      l.*,
      v.nombre AS vendedor_nombre
    FROM vendedor_liquidaciones l
    INNER JOIN vendedores v ON v.id = l.vendedor_id
    WHERE l.empresa_id = ?
  `;

  const params = [empresaId];

  if (vendedorId) {
    sql += ` AND l.vendedor_id = ?`;
    params.push(vendedorId);
  }

  sql += ` ORDER BY l.id DESC`;

  return db.prepare(sql).all(...params);
}

module.exports = {
  registrarComision,
  getComisionById,
  listarComisiones,
  liquidarComisiones,
  listarLiquidaciones,
};
