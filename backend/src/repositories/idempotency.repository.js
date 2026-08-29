const crypto = require("crypto");
const db = require("../db/database");

function hashRequest(body) {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function getIdempotency({ empresaId, key }) {
  return db
    .prepare(
      `
    SELECT *
    FROM idempotency_keys
    WHERE empresa_id = ?
      AND idempotency_key = ?
  `,
    )
    .get(empresaId, key);
}

function saveIdempotency({ empresaId, key, requestHash, response }) {
  db.prepare(
    `
    INSERT INTO idempotency_keys (
      empresa_id,
      idempotency_key,
      request_hash,
      response_json
    )
    VALUES (?, ?, ?, ?)
  `,
  ).run(empresaId, key, requestHash, JSON.stringify(response));
}

module.exports = {
  hashRequest,
  getIdempotency,
  saveIdempotency,
};
