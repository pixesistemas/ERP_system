const db = require("../db/database");
const { normalizePhone } = require("../utils/validators");

function isTelefonoAutorizado({ empresaId, telefono }) {
  const tel = normalizePhone(telefono);

  const row = db
    .prepare(
      `
    SELECT *
    FROM whatsapp_autorizados
    WHERE empresa_id = ?
      AND telefono = ?
      AND activo = 1
  `,
    )
    .get(empresaId, tel);

  return !!row;
}

function saveTelefonoAutorizado({
  empresaId,
  telefono,
  nombre,
  rol = "OPERADOR",
}) {
  const tel = normalizePhone(telefono);

  db.prepare(
    `
    INSERT INTO whatsapp_autorizados (
      empresa_id, telefono, nombre, rol, activo
    )
    VALUES (
      @empresa_id, @telefono, @nombre, @rol, 1
    )
    ON CONFLICT(empresa_id, telefono) DO UPDATE SET
      nombre = excluded.nombre,
      rol = excluded.rol,
      activo = 1
  `,
  ).run({
    empresa_id: empresaId,
    telefono: tel,
    nombre: nombre || null,
    rol,
  });
}

module.exports = {
  normalizePhone,
  isTelefonoAutorizado,
  saveTelefonoAutorizado,
};
