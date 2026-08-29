const bcrypt = require("bcryptjs");
const db = require("../db/database");

function getUsuarioById(id) {
  return db
    .prepare(
      `
    SELECT id, nombre, email, telefono, activo, created_at
    FROM usuarios
    WHERE id = ?
  `,
    )
    .get(id);
}

function crearUsuario({
  nombre,
  email,
  telefono = null,
  password,
  empresaId,
  rolNombre = "ADMIN",
}) {
  const passwordHash = bcrypt.hashSync(password, 10);

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO usuarios (
        nombre, email, telefono, password_hash, activo
      )
      VALUES (?, ?, ?, ?, 1)
    `,
      )
      .run(nombre, email, telefono, passwordHash);

    const usuarioId = result.lastInsertRowid;

    db.prepare(
      `
      INSERT OR IGNORE INTO usuario_empresas (
        usuario_id, empresa_id, activo
      )
      VALUES (?, ?, 1)
    `,
    ).run(usuarioId, empresaId);

    const rol = db
      .prepare(
        `
      SELECT *
      FROM roles
      WHERE nombre = ?
    `,
      )
      .get(rolNombre);

    if (!rol) {
      throw new Error(`Rol no encontrado: ${rolNombre}`);
    }

    db.prepare(
      `
      INSERT OR IGNORE INTO usuario_roles (
        usuario_id, empresa_id, rol_id
      )
      VALUES (?, ?, ?)
    `,
    ).run(usuarioId, empresaId, rol.id);

    return usuarioId;
  });

  return getUsuarioById(transaction());
}

function listUsuariosByEmpresa(empresaId) {
  return db
    .prepare(
      `
    SELECT 
      u.id,
      u.nombre,
      u.email,
      u.telefono,
      u.activo,
      u.created_at,
      r.nombre AS rol
    FROM usuarios u
    INNER JOIN usuario_empresas ue ON ue.usuario_id = u.id
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id AND ur.empresa_id = ue.empresa_id
    LEFT JOIN roles r ON r.id = ur.rol_id
    WHERE ue.empresa_id = ?
    ORDER BY u.nombre
  `,
    )
    .all(empresaId);
}
function setUsuarioActivo({ usuarioId, activo }) {
  db.prepare(
    `
    UPDATE usuarios
    SET activo = ?
    WHERE id = ?
  `,
  ).run(activo ? 1 : 0, usuarioId);

  return getUsuarioById(usuarioId);
}

function cambiarRolUsuario({ usuarioId, empresaId, rolNombre }) {
  const rol = db
    .prepare(
      `
    SELECT *
    FROM roles
    WHERE nombre = ?
  `,
    )
    .get(rolNombre);

  if (!rol) {
    throw new Error(`Rol no encontrado: ${rolNombre}`);
  }

  db.prepare(
    `
    DELETE FROM usuario_roles
    WHERE usuario_id = ?
      AND empresa_id = ?
  `,
  ).run(usuarioId, empresaId);

  db.prepare(
    `
    INSERT INTO usuario_roles (
      usuario_id, empresa_id, rol_id
    )
    VALUES (?, ?, ?)
  `,
  ).run(usuarioId, empresaId, rol.id);

  return getUsuarioById(usuarioId);
}

module.exports = {
  crearUsuario,
  getUsuarioById,
  listUsuariosByEmpresa,
  setUsuarioActivo,
  cambiarRolUsuario,
};
