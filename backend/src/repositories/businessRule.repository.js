const db = require("../db/database");

function listarReglasActivasPorEvento({ empresaId, evento }) {
  return db
    .prepare(
      `
    SELECT *
    FROM business_rules
    WHERE empresa_id = ?
      AND evento = ?
      AND activa = 1
    ORDER BY id
  `,
    )
    .all(empresaId, evento);
}

function crearRegla({ empresaId, nombre, evento, condicion, accion }) {
  const result = db
    .prepare(
      `
    INSERT INTO business_rules (
      empresa_id,
      nombre,
      evento,
      condicion,
      accion,
      activa
    )
    VALUES (?, ?, ?, ?, ?, 1)
  `,
    )
    .run(
      empresaId,
      nombre,
      evento,
      JSON.stringify(condicion),
      JSON.stringify(accion),
    );

  return db
    .prepare(
      `
    SELECT *
    FROM business_rules
    WHERE id = ?
  `,
    )
    .get(result.lastInsertRowid);
}

module.exports = {
  listarReglasActivasPorEvento,
  crearRegla,
};
