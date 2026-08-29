const db = require("../db/database");

function guardarLink({
  empresaId,
  clienteId,
  documentoId,
  proveedor,
  importe,
  moneda = "ARS",
  url,
  qrData,
  externalId,
  estado = "PENDIENTE",
  vencimiento,
}) {
  const info = db
    .prepare(
      `INSERT INTO links_pago
        (empresa_id, cliente_id, documento_id, proveedor, importe, moneda, url, qr_data, external_id, estado, vencimiento)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      empresaId,
      clienteId || null,
      documentoId || null,
      proveedor,
      importe,
      moneda,
      url || null,
      qrData || null,
      externalId || null,
      estado,
      vencimiento || null,
    );
  return db.prepare("SELECT * FROM links_pago WHERE id=?").get(
    info.lastInsertRowid,
  );
}

function marcarPagado({ empresaId, externalId, webhookRaw }) {
  return db
    .prepare(
      `UPDATE links_pago
       SET estado='PAGADO', fecha_pago=CURRENT_TIMESTAMP, webhook_raw=?
       WHERE empresa_id=? AND external_id=? AND estado='PENDIENTE'`,
    )
    .run(JSON.stringify(webhookRaw || null), empresaId, externalId);
}

function buscarPendientePorDocumento(empresaId, documentoId) {
  return db
    .prepare(
      `SELECT * FROM links_pago WHERE empresa_id=? AND documento_id=? AND estado='PENDIENTE' ORDER BY id DESC LIMIT 1`,
    )
    .get(empresaId, documentoId);
}

function obtenerPasarela(empresaId, proveedor) {
  const row = db
    .prepare(
      "SELECT * FROM pasarelas_pago WHERE empresa_id=? AND proveedor=? AND activo=1",
    )
    .get(empresaId, proveedor);
  return row || null;
}

function guardarPasarela({
  empresaId,
  proveedor,
  nombre,
  activo,
  credenciales,
  config,
}) {
  const existente = obtenerPasarela(empresaId, proveedor);
  if (existente) {
    db.prepare(
      `UPDATE pasarelas_pago SET nombre=?, activo=?, credenciales=?, config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(
      nombre || proveedor,
      activo ? 1 : 0,
      JSON.stringify(credenciales || {}),
      JSON.stringify(config || {}),
      existente.id,
    );
    return db.prepare("SELECT * FROM pasarelas_pago WHERE id=?").get(
      existente.id,
    );
  }
  const info = db
    .prepare(
      `INSERT INTO pasarelas_pago (empresa_id, proveedor, nombre, activo, credenciales, config) VALUES (?,?,?,?,?,?)`,
    )
    .run(
      empresaId,
      proveedor,
      nombre || proveedor,
      activo ? 1 : 0,
      JSON.stringify(credenciales || {}),
      JSON.stringify(config || {}),
    );
  return db.prepare("SELECT * FROM pasarelas_pago WHERE id=?").get(
    info.lastInsertRowid,
  );
}

module.exports = {
  guardarLink,
  marcarPagado,
  buscarPendientePorDocumento,
  obtenerPasarela,
  guardarPasarela,
};
