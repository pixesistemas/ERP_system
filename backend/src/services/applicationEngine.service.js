const db = require("../db/database");

function getFacturasPendientes({ empresaId, clienteDoc }) {
  return db
    .prepare(
      `
    SELECT 
      m.*,
      IFNULL(SUM(a.importe), 0) AS aplicado,
      m.debe - IFNULL(SUM(a.importe), 0) AS pendiente
    FROM cliente_cc_movimientos m
    LEFT JOIN cliente_cc_aplicaciones a 
      ON a.movimiento_debe_id = m.id
    WHERE m.empresa_id = ?
      AND m.cliente_doc = ?
      AND m.debe > 0
    GROUP BY m.id
    HAVING pendiente > 0
    ORDER BY m.created_at ASC, m.id ASC
  `,
    )
    .all(empresaId, String(clienteDoc));
}

function aplicarPagoAutomatico({
  empresaId,
  clienteDoc,
  movimientoHaberId,
  importe,
}) {
  let saldoAplicar = Number(importe || 0);

  if (saldoAplicar <= 0) {
    return [];
  }

  const aplicaciones = [];
  const pendientes = getFacturasPendientes({
    empresaId,
    clienteDoc,
  });

  const transaction = db.transaction(() => {
    for (const deuda of pendientes) {
      if (saldoAplicar <= 0) break;

      const importeAplicar = Math.min(saldoAplicar, Number(deuda.pendiente));

      db.prepare(
        `
        INSERT INTO cliente_cc_aplicaciones (
          empresa_id,
          cliente_doc,
          movimiento_debe_id,
          movimiento_haber_id,
          importe
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(
        empresaId,
        String(clienteDoc),
        deuda.id,
        movimientoHaberId,
        importeAplicar,
      );

      aplicaciones.push({
        movimientoDebeId: deuda.id,
        movimientoHaberId,
        importe: importeAplicar,
      });

      saldoAplicar -= importeAplicar;
    }
  });

  transaction();

  return aplicaciones;
}

function aplicarPagoManual({
  empresaId,
  clienteDoc,
  movimientoDebeId,
  movimientoHaberId,
  importe,
}) {
  const monto = Number(importe || 0);

  if (monto <= 0) {
    const error = new Error("Importe de aplicación inválido");
    error.statusCode = 400;
    throw error;
  }

  db.prepare(
    `
    INSERT INTO cliente_cc_aplicaciones (
      empresa_id,
      cliente_doc,
      movimiento_debe_id,
      movimiento_haber_id,
      importe
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    empresaId,
    String(clienteDoc),
    movimientoDebeId,
    movimientoHaberId,
    monto,
  );

  return {
    movimientoDebeId,
    movimientoHaberId,
    importe: monto,
  };
}

module.exports = {
  getFacturasPendientes,
  aplicarPagoAutomatico,
  aplicarPagoManual,
};
