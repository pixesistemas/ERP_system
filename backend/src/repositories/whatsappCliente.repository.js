const db = require("../db/database");
const { normalizePhone } = require("../utils/validators");
const { saveCliente, getClienteById } = require("./cliente.repository");

const ESTADOS = Object.freeze({
  PENDIENTE: "PENDIENTE",
  APROBADO: "APROBADO",
  RECHAZADO: "RECHAZADO",
});

function getSolicitud({ empresaId, telefono }) {
  const tel = normalizePhone(telefono);

  return db
    .prepare(
      `
      SELECT *
      FROM whatsapp_clientes
      WHERE empresa_id = ?
        AND telefono = ?
    `,
    )
    .get(empresaId, tel);
}

/*
 * Registra el primer contacto de un número nuevo. Si ya existe una
 * solicitud para ese número, no la pisa (devuelve la que ya había).
 */
function registrarSolicitud({ empresaId, telefono, nombreDeclarado }) {
  const tel = normalizePhone(telefono);

  db.prepare(
    `
    INSERT OR IGNORE INTO whatsapp_clientes (
      empresa_id, telefono, nombre_declarado, estado
    )
    VALUES (?, ?, ?, 'PENDIENTE')
  `,
  ).run(empresaId, tel, nombreDeclarado || null);

  return getSolicitud({ empresaId, telefono: tel });
}

function listSolicitudes({ empresaId, estado = null }) {
  if (estado) {
    return db
      .prepare(
        `
        SELECT w.*, c.razon_social AS cliente_nombre
        FROM whatsapp_clientes w
        LEFT JOIN clientes c ON c.id = w.cliente_id
        WHERE w.empresa_id = ?
          AND w.estado = ?
        ORDER BY w.created_at DESC
      `,
      )
      .all(empresaId, estado);
  }

  return db
    .prepare(
      `
      SELECT w.*, c.razon_social AS cliente_nombre
      FROM whatsapp_clientes w
      LEFT JOIN clientes c ON c.id = w.cliente_id
      WHERE w.empresa_id = ?
      ORDER BY w.created_at DESC
    `,
    )
    .all(empresaId);
}

/*
 * Aprueba una solicitud. Si se pasa clienteId, la vincula a un cliente ya
 * existente. Si no, crea un cliente nuevo con el nombre declarado y el
 * teléfono de contacto.
 */
function aprobarSolicitud({ empresaId, solicitudId, clienteId, datosClienteNuevo }) {
  const solicitud = db
    .prepare(`SELECT * FROM whatsapp_clientes WHERE id = ? AND empresa_id = ?`)
    .get(solicitudId, empresaId);

  if (!solicitud) {
    const error = new Error("Solicitud no encontrada");
    error.statusCode = 404;
    throw error;
  }

  let finalClienteId = clienteId || null;

  if (!finalClienteId) {
    saveCliente({
      empresaId,
      razonSocial: datosClienteNuevo?.razonSocial || solicitud.nombre_declarado || "Cliente WhatsApp",
      telefono: solicitud.telefono,
      cuit: datosClienteNuevo?.cuit || null,
      dni: datosClienteNuevo?.dni || null,
      condicionIVA: datosClienteNuevo?.condicionIVA || "CF",
    });

    // saveCliente solo devuelve el registro creado cuando hay CUIT (lo
    // busca por ese dato); acá lo resolvemos por teléfono, que es único
    // para esta solicitud recién aprobada.
    const creado = db
      .prepare(
        `SELECT id FROM clientes WHERE empresa_id = ? AND telefono = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(empresaId, solicitud.telefono);

    if (!creado) {
      const error = new Error("No se pudo crear el cliente a partir de la solicitud.");
      error.statusCode = 500;
      throw error;
    }

    finalClienteId = creado.id;
  } else if (!getClienteById(finalClienteId)) {
    const error = new Error("El cliente indicado no existe");
    error.statusCode = 400;
    throw error;
  }

  db.prepare(
    `
    UPDATE whatsapp_clientes
    SET estado = 'APROBADO', cliente_id = ?, resuelto_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(finalClienteId, solicitudId);

  return getSolicitud({ empresaId, telefono: solicitud.telefono });
}

function rechazarSolicitud({ empresaId, solicitudId }) {
  db.prepare(
    `
    UPDATE whatsapp_clientes
    SET estado = 'RECHAZADO', resuelto_at = CURRENT_TIMESTAMP
    WHERE id = ? AND empresa_id = ?
  `,
  ).run(solicitudId, empresaId);
}

/*
 * Devuelve una solicitud a pendiente (dar de alta de nuevo o reactivar
 * un número que se había dado de baja).
 */
function reactivarSolicitud({ empresaId, solicitudId }) {
  db.prepare(
    `
    UPDATE whatsapp_clientes
    SET estado = 'PENDIENTE', resuelto_at = NULL
    WHERE id = ? AND empresa_id = ?
  `,
  ).run(solicitudId, empresaId);
}

module.exports = {
  ESTADOS,
  getSolicitud,
  registrarSolicitud,
  listSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud,
  reactivarSolicitud,
};
