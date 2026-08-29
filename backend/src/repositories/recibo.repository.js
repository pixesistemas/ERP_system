const db = require("../db/database");
const { getNextNumero } = require("./numerador.repository");

const {
  registrarMovimientoCC,
} = require("./clienteCuentaCorriente.repository");

const {
  aplicarPagoAutomatico,
} = require("../services/applicationEngine.service");

function calcularTotal(detalles = []) {
  return detalles.reduce((total, detalle) => {
    return total + Number(detalle.importe || 0);
  }, 0);
}

function getReciboById(id) {
  const recibo = db
    .prepare(
      `
    SELECT *
    FROM recibos
    WHERE id = ?
  `,
    )
    .get(id);

  if (!recibo) return null;

  const detalles = db
    .prepare(
      `
    SELECT *
    FROM recibo_detalles
    WHERE recibo_id = ?
    ORDER BY id
  `,
    )
    .all(id);

  return {
    ...recibo,
    detalles,
  };
}

function crearRecibo({
  empresaId,
  clienteId = null,
  clienteDoc,
  clienteNombre,
  detalles = [],
  observaciones = null,
  usuarioId = null,
  puntoVenta = 1,
}) {
  if (!clienteDoc) {
    throw new Error("Debe informar clienteDoc");
  }

  if (!clienteNombre) {
    throw new Error("Debe informar clienteNombre");
  }

  if (!detalles.length) {
    throw new Error("Debe informar al menos un medio de pago");
  }

  const numero = getNextNumero({
    empresaId,
    tipo: "RECIBO",
    puntoVenta,
  });

  const importeTotal = calcularTotal(detalles);

  const insertRecibo = db.prepare(`
    INSERT INTO recibos (
      empresa_id,
      cliente_id,
      cliente_doc,
      cliente_nombre,
      punto_venta,
      numero,
      importe_total,
      estado,
      observaciones,
      usuario_id
    )
    VALUES (
      @empresa_id,
      @cliente_id,
      @cliente_doc,
      @cliente_nombre,
      @punto_venta,
      @numero,
      @importe_total,
      'BORRADOR',
      @observaciones,
      @usuario_id
    )
  `);

  const insertDetalle = db.prepare(`
    INSERT INTO recibo_detalles (
      recibo_id,
      medio_pago,
      importe,
      banco,
      cuenta,
      alias,
      cbu,
      numero_operacion,
      tarjeta,
      cuotas,
      lote,
      cupon,
      autorizacion,
      cheque_numero,
      cheque_banco,
      cheque_fecha_emision,
      cheque_fecha_cobro,
      observaciones
    )
    VALUES (
      @recibo_id,
      @medio_pago,
      @importe,
      @banco,
      @cuenta,
      @alias,
      @cbu,
      @numero_operacion,
      @tarjeta,
      @cuotas,
      @lote,
      @cupon,
      @autorizacion,
      @cheque_numero,
      @cheque_banco,
      @cheque_fecha_emision,
      @cheque_fecha_cobro,
      @observaciones
    )
  `);

  const transaction = db.transaction(() => {
    const result = insertRecibo.run({
      empresa_id: empresaId,
      cliente_id: clienteId,
      cliente_doc: String(clienteDoc),
      cliente_nombre: clienteNombre,
      punto_venta: puntoVenta,
      numero,
      importe_total: importeTotal,
      observaciones,
      usuario_id: usuarioId,
    });

    const reciboId = result.lastInsertRowid;

    for (const detalle of detalles) {
      insertDetalle.run({
        recibo_id: reciboId,
        medio_pago: detalle.medioPago,
        importe: Number(detalle.importe || 0),

        banco: detalle.banco || null,
        cuenta: detalle.cuenta || null,
        alias: detalle.alias || null,
        cbu: detalle.cbu || null,
        numero_operacion: detalle.numeroOperacion || null,

        tarjeta: detalle.tarjeta || null,
        cuotas: detalle.cuotas || null,
        lote: detalle.lote || null,
        cupon: detalle.cupon || null,
        autorizacion: detalle.autorizacion || null,

        cheque_numero: detalle.chequeNumero || null,
        cheque_banco: detalle.chequeBanco || null,
        cheque_fecha_emision: detalle.chequeFechaEmision || null,
        cheque_fecha_cobro: detalle.chequeFechaCobro || null,

        observaciones: detalle.observaciones || null,
      });
    }

    return reciboId;
  });

  return getReciboById(transaction());
}

function listarRecibos({ empresaId }) {
  return db
    .prepare(
      `
    SELECT *
    FROM recibos
    WHERE empresa_id = ?
    ORDER BY id DESC
  `,
    )
    .all(empresaId);
}

function confirmarRecibo({ reciboId, empresaId }) {
  const recibo = getReciboById(reciboId);

  if (!recibo) {
    return null;
  }

  if (recibo.empresa_id !== empresaId) {
    const error = new Error("No autorizado");
    error.statusCode = 403;
    throw error;
  }

  if (recibo.estado !== "BORRADOR") {
    const error = new Error("Solo se pueden confirmar recibos en BORRADOR");
    error.statusCode = 400;
    throw error;
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `
      UPDATE recibos
      SET estado = 'CONFIRMADO',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND empresa_id = ?
    `,
    ).run(reciboId, empresaId);

    const movimiento = registrarMovimientoCC({
      empresaId,
      clienteId: recibo.cliente_id || null,
      clienteDoc: recibo.cliente_doc,
      clienteNombre: recibo.cliente_nombre,
      tipo: "RECIBO",
      concepto: `Recibo ${recibo.punto_venta}-${recibo.numero}`,
      haber: recibo.importe_total,
      documentoId: recibo.id,
      observaciones: `Recibo interno #${recibo.id} generado automáticamente`,
    });

    const aplicaciones = aplicarPagoAutomatico({
      empresaId,
      clienteDoc: recibo.cliente_doc,
      movimientoHaberId: movimiento.id,
      importe: recibo.importe_total,
    });

    return {
      movimiento,
      aplicaciones,
    };
  });

  const result = transaction();

  return {
    ...getReciboById(reciboId),
    cuentaCorriente: result,
  };
}

module.exports = {
  crearRecibo,
  getReciboById,
  listarRecibos,
  confirmarRecibo,
};
