const crypto = require("crypto");
const db = require("../db/database");

function createRefreshToken({ usuarioId, empresaId, days = 30 }) {
  const token = crypto.randomBytes(48).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  db.prepare(
    `
    INSERT INTO refresh_tokens (
      usuario_id, empresa_id, token, expires_at
    )
    VALUES (?, ?, ?, ?)
  `,
  ).run(usuarioId, empresaId, token, expiresAt.toISOString());

  return token;
}

function getRefreshToken(token) {
  return db
    .prepare(
      `
    SELECT *
    FROM refresh_tokens
    WHERE token = ?
      AND revoked = 0
  `,
    )
    .get(token);
}

function revokeRefreshToken(token) {
  db.prepare(
    `
    UPDATE refresh_tokens
    SET revoked = 1
    WHERE token = ?
  `,
  ).run(token);
}

/*
 * Extiende el vencimiento del token mientras se sigue usando: así el
 * celular del vendedor no vuelve a pedir usuario y clave.
 */
function touchRefreshToken(id, days = 30) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  db.prepare("UPDATE refresh_tokens SET expires_at=? WHERE id=?").run(
    expiresAt.toISOString(),
    id,
  );
}

/*
 * Dispositivos (sesiones recordadas) activos de un usuario.
 */
function listarDispositivos(usuarioId) {
  return db
    .prepare(
      `SELECT r.id, r.empresa_id, e.nombre empresa, r.created_at, r.expires_at
       FROM refresh_tokens r
       LEFT JOIN empresas e ON e.id = r.empresa_id
       WHERE r.usuario_id = ? AND r.revoked = 0
       ORDER BY r.id DESC`,
    )
    .all(usuarioId);
}

/*
 * Revoca los dispositivos de un usuario. Sin ids revoca todos.
 */
function revocarDispositivos(usuarioId, ids = []) {
  const lista = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
  if (!lista.length) {
    return db
      .prepare("UPDATE refresh_tokens SET revoked=1 WHERE usuario_id=? AND revoked=0")
      .run(usuarioId).changes;
  }
  const ph = lista.map(() => "?").join(",");
  return db
    .prepare(
      `UPDATE refresh_tokens SET revoked=1 WHERE usuario_id=? AND id IN (${ph})`,
    )
    .run(usuarioId, ...lista).changes;
}

module.exports = {
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  touchRefreshToken,
  listarDispositivos,
  revocarDispositivos,
};
