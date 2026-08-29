const {
  getSaldoCliente,
  registrarMovimientoCC,
  listarMovimientosCliente,
} = require("../repositories/clienteCuentaCorriente.repository");

const {
  getFacturasPendientes,
} = require("../services/applicationEngine.service");

const { aplicarPagoManual } = require("../services/applicationEngine.service");
const { crearRecibo, confirmarRecibo } = require("../repositories/recibo.repository");
const db = require("../db/database");

function consultar(req, res, next) {
  try {
    const clienteDoc = req.params.clienteDoc;

    const saldo = getSaldoCliente({
      empresaId: req.empresa.id,
      clienteDoc,
    });

    const movimientos = listarMovimientosCliente({
      empresaId: req.empresa.id,
      clienteDoc,
    });

    res.json({
      ok: true,
      clienteDoc,
      saldo,
      movimientos,
    });
  } catch (error) {
    next(error);
  }
}

function cobrar(req, res, next) {
  try {
    const { clienteId, clienteDoc, clienteNombre, importe, observaciones, detalles = [] } = req.body;

    if (!clienteDoc || !importe) {
      return res.status(400).json({ ok: false, error: "Debe informar clienteDoc e importe" });
    }

    const medios = detalles.length ? detalles : [{ medioPago: "EFECTIVO", importe: Number(importe) }];
    const reciboBorrador = crearRecibo({
      empresaId: req.empresa.id, clienteId: clienteId || null, clienteDoc,
      clienteNombre: clienteNombre || "CLIENTE", detalles: medios, observaciones,
      usuarioId: req.usuario?.id || null, puntoVenta: 1,
    });
    const recibo = confirmarRecibo({ reciboId: reciboBorrador.id, empresaId: req.empresa.id });

    const insertCheque = db.prepare(`INSERT INTO cheques(empresa_id,numero,banco_origen,librador,importe,fecha_emision,fecha_vencimiento,estado,cliente_id,comprobante_tipo,comprobante_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    for (const medio of medios) {
      const esCheque = String(medio.medioPago || "").toUpperCase() === "CHEQUE";
      if (!esCheque || !medio.chequeNumero) continue;
      const importe = Number(medio.importe || 0);
      if (importe <= 0) continue;
      insertCheque.run(req.empresa.id, String(medio.chequeNumero), medio.chequeBanco || "", medio.chequeLibrador || "", importe, medio.chequeFechaEmision || null, medio.chequeFechaCobro || null, "EN_CARTERA", clienteId || null, "RECIBO", recibo.id);
    }

    const mediosEfectivos = medios.filter((m) => !["CHEQUE", "CHEQUES"].includes(String(m.medioPago || "").toUpperCase()) && Number(m.importe || 0) > 0);
    const totalRecibido = mediosEfectivos.reduce((n, m) => n + Number(m.importe || 0), 0);
    if (totalRecibido > 0) {
      const session = db.prepare("SELECT * FROM caja_sesiones WHERE empresa_id=? AND estado='ABIERTA' ORDER BY id DESC LIMIT 1").get(req.empresa.id);
      if (session) {
        db.prepare(`INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,cliente_nombre,caja_sesion_id,sucursal_id,cajero_id) VALUES(?,?,?,?,?,?,?,?,?)`)
          .run(
            req.empresa.id, "INGRESO",
            `RECIBO ${String(recibo.punto_venta || 1).padStart(4, "0")}-${String(recibo.numero || 0).padStart(8, "0")} (cobro cuenta corriente)`,
            totalRecibido,
            JSON.stringify(Object.fromEntries(mediosEfectivos.map((m) => [String(m.medioPago || "").toUpperCase(), Number(m.importe)]))),
            clienteNombre || "CLIENTE", session.id, session.sucursal_id || null, session.cajero_id || null,
          );
        db.prepare("UPDATE caja_sesiones SET saldo_teorico=saldo_teorico+? WHERE id=?").run(totalRecibido, session.id);
      }
    }

    res.json({ ok: true, recibo });
  } catch (error) { next(error); }
}

function pendientes(req, res, next) {
  try {
    const clienteDoc = req.params.clienteDoc;

    const facturas = getFacturasPendientes({
      empresaId: req.empresa.id,
      clienteDoc,
    });

    res.json({
      ok: true,
      clienteDoc,
      total: facturas.length,
      facturas,
    });
  } catch (error) {
    next(error);
  }
}

function aplicar(req, res, next) {
  try {
    const aplicacion = aplicarPagoManual({
      empresaId: req.empresa.id,
      clienteDoc: req.body.clienteDoc,
      movimientoDebeId: req.body.movimientoDebeId,
      movimientoHaberId: req.body.movimientoHaberId,
      importe: req.body.importe,
    });

    res.json({
      ok: true,
      aplicacion,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  consultar,
  cobrar,
  pendientes,
  aplicar,
};
