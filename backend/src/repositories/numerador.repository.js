const db = require("../db/database");

function getNextNumero({ empresaId, tipo, puntoVenta = 1 }) {
  const transaction = db.transaction(() => {
    const row = db
      .prepare(
        `
      SELECT *
      FROM documento_numeradores
      WHERE empresa_id = ?
        AND tipo = ?
        AND punto_venta = ?
    `,
      )
      .get(empresaId, tipo, puntoVenta);

    if (!row) {
      db.prepare(
        `
        INSERT INTO documento_numeradores (
          empresa_id, tipo, punto_venta, ultimo_numero, updated_at
        )
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      `,
      ).run(empresaId, tipo, puntoVenta);

      return 1;
    }

    const next = Number(row.ultimo_numero) + 1;

    db.prepare(
      `
      UPDATE documento_numeradores
      SET ultimo_numero = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(next, row.id);

    return next;
  });

  return transaction();
}

module.exports = {
  getNextNumero,
};
