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

module.exports = {
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
};
