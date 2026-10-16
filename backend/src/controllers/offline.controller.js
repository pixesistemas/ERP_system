const db = require("../db/database");
const erp = require("./erpConsolidation.controller");

/*
 * Sincronización de operaciones hechas sin conexión (módulo MODO_OFFLINE).
 *
 * El POS guarda cada venta en IndexedDB con un uuid generado en el equipo
 * y la envía acá al recuperar la conexión, en lotes chicos. Este endpoint
 * es idempotente: el uuid se registra en offline_operaciones y en
 * ventas_pos.uuid, así que reintentar nunca duplica nada.
 *
 * Las ventas de factura electrónica se intentan emitir al sincronizar
 * (el servidor sí tiene internet). Si ARCA no responde o rechaza, la
 * operación queda igual registrada como PENDIENTE fiscal para revisarla
 * o reintentarla: el cobro ya se hizo en el mostrador.
 */

const TIPOS_SOPORTADOS = new Set(["VENTA_POS"]);
const MAX_LOTE = 25;

function safeParse(valor) {
  try {
    return JSON.parse(valor);
  } catch (e) {
    return null;
  }
}

async function aplicarOperacion({ empresaId, usuarioId, uuid, tipo, fechaCliente, payload }) {
  if (!TIPOS_SOPORTADOS.has(tipo)) {
    return { ok: false, error: `Tipo de operación no soportado: ${tipo}` };
  }
  /*
   * Se reutiliza tal cual el alta del POS (numeración, stock, caja, cuenta
   * corriente y emisión de CAE). El uuid viaja en el payload para que el
   * alta deduplique sola si la operación ya estaba aplicada.
   */
  const req = {
    empresa: { id: empresaId },
    usuario: { id: usuarioId, empresaId },
    user: { id: usuarioId, empresaId },
    body: {
      ...(payload || {}),
      uuid,
      offline_replay: true,
      ...(fechaCliente ? { fecha_cliente: fechaCliente } : {}),
    },
  };
  let status = 200;
  let data = null;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(v) {
      data = v;
      return v;
    },
  };
  try {
    await erp.createPosOperation(req, res);
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
  if (!data) return { ok: false, error: `La operación no devolvió resultado (HTTP ${status}).` };
  if (!data.ok) return { ok: false, error: data.error || `HTTP ${status}` };
  return { ok: true, operation: data.operation || null, repetida: Boolean(data.repetida) };
}

async function sincronizarOperaciones(req, res, next) {
  try {
    const e = Number(req.empresa?.id || 0);
    const uid = Number(req.user?.id || req.usuario?.id || 0) || null;
    const deviceId = String(req.body?.dispositivo || "").trim().slice(0, 150) || null;
    const operaciones = Array.isArray(req.body?.operaciones) ? req.body.operaciones : [];
    if (!e) return res.status(400).json({ ok: false, error: "Empresa no identificada." });
    if (!operaciones.length) {
      return res.status(400).json({ ok: false, error: "No se recibieron operaciones para sincronizar." });
    }
    if (operaciones.length > MAX_LOTE) {
      return res.status(400).json({ ok: false, error: `Máximo ${MAX_LOTE} operaciones por sincronización. Enviá lotes más chicos.` });
    }

    if (deviceId) {
      db.prepare(
        `INSERT INTO sync_dispositivos(empresa_id,usuario_id,device_id,origen,ultima_sync)
         VALUES(?,?,?,'POS',CURRENT_TIMESTAMP)
         ON CONFLICT(empresa_id,device_id) DO UPDATE SET usuario_id=excluded.usuario_id,origen='POS',ultima_sync=CURRENT_TIMESTAMP`,
      ).run(e, uid, deviceId);
    }

    const buscar = db.prepare("SELECT * FROM offline_operaciones WHERE empresa_id=? AND uuid=?");
    const crear = db.prepare(
      `INSERT INTO offline_operaciones(empresa_id,usuario_id,device_id,uuid,tipo,fecha_cliente,payload_json,estado)
       VALUES(?,?,?,?,?,?,?,'PROCESANDO')`,
    );
    const marcar = db.prepare(
      `UPDATE offline_operaciones SET estado=?,resultado_json=?,error=?,aplicado_at=CURRENT_TIMESTAMP
       WHERE empresa_id=? AND uuid=?`,
    );

    const resultados = [];
    let aplicadas = 0;
    let rechazadas = 0;
    let duplicadas = 0;

    for (const op of operaciones) {
      const uuid = String(op?.uuid || "").trim();
      const tipo = String(op?.tipo || "VENTA_POS").trim().toUpperCase();
      const fechaCliente = String(op?.creado_en || "").trim() || null;
      const payload = op?.payload && typeof op.payload === "object" ? op.payload : null;

      if (!uuid) {
        rechazadas++;
        resultados.push({ uuid: "", ok: false, error: "Falta el uuid de la operación." });
        continue;
      }

      const previa = buscar.get(e, uuid);
      if (previa) {
        if (String(previa.estado) === "APLICADA") {
          duplicadas++;
          resultados.push({ uuid, ok: true, duplicada: true, operation: safeParse(previa.resultado_json) });
        } else {
          rechazadas++;
          resultados.push({ uuid, ok: false, error: previa.error || "La operación fue rechazada anteriormente." });
        }
        continue;
      }

      if (!payload) {
        crear.run(e, uid, deviceId, uuid, tipo, fechaCliente, "{}");
        marcar.run("RECHAZADA", null, "La operación no trae datos.", e, uuid);
        rechazadas++;
        resultados.push({ uuid, ok: false, error: "La operación no trae datos." });
        continue;
      }

      crear.run(e, uid, deviceId, uuid, tipo, fechaCliente, JSON.stringify(payload));
      const r = await aplicarOperacion({ empresaId: e, usuarioId: uid, uuid, tipo, fechaCliente, payload });
      if (r.ok) {
        const operacion = r.operation || {};
        marcar.run("APLICADA", JSON.stringify(operacion), null, e, uuid);
        aplicadas++;
        resultados.push({ uuid, ok: true, duplicada: Boolean(r.repetida), operation: operacion });
      } else {
        marcar.run("RECHAZADA", null, String(r.error).slice(0, 500), e, uuid);
        rechazadas++;
        resultados.push({ uuid, ok: false, error: r.error });
      }
    }

    return res.json({ ok: true, aplicadas, rechazadas, duplicadas, resultados });
  } catch (error) {
    next(error);
  }
}

module.exports = { sincronizarOperaciones };
