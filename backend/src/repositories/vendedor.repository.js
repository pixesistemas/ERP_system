const db = require("../db/database");

function mapVendedor(row) {
  if (!row) return null;

  return {
    id: row.id,
    empresaId: row.empresa_id,
    nombre: row.nombre,
    telefono: row.telefono,
    email: row.email,
    comisionPorcentaje: row.comision_porcentaje,
    activo: row.activo === 1,
  };
}

function saveVendedor({
  empresaId,
  nombre,
  telefono = null,
  email = null,
  comisionPorcentaje = 0,
}) {
  const result = db
    .prepare(
      `
    INSERT INTO vendedores (
      empresa_id, nombre, telefono, email, comision_porcentaje, activo
    )
    VALUES (?, ?, ?, ?, ?, 1)
  `,
    )
    .run(empresaId, nombre, telefono, email, Number(comisionPorcentaje || 0));

  return getVendedorById(result.lastInsertRowid);
}

function getVendedorById(id) {
  const row = db
    .prepare(
      `
    SELECT *
    FROM vendedores
    WHERE id = ?
      AND activo = 1
  `,
    )
    .get(id);

  return mapVendedor(row);
}

function listVendedoresByEmpresa(empresaId) {
  return db
    .prepare(
      `
    SELECT *
    FROM vendedores
    WHERE empresa_id = ?
      AND activo = 1
    ORDER BY nombre
  `,
    )
    .all(empresaId)
    .map(mapVendedor);
}

module.exports = {
  saveVendedor,
  getVendedorById,
  listVendedoresByEmpresa,
};
