const bcrypt = require("bcryptjs");
const db = require("../db/database");

function getUsuarioById(id) {
  return db
    .prepare(
      `
    SELECT id, nombre, usuario, email, telefono, activo, created_at
    FROM usuarios
    WHERE id = ?
  `,
    )
    .get(id);
}

function crearUsuario({
  nombre,
  usuario = null,
  email,
  telefono = null,
  password,
  empresaId,
  rolNombre = "ADMIN",
}) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const nombreUsuario = usuario ? String(usuario).trim().toLowerCase() : null;

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO usuarios (
        nombre, usuario, email, telefono, password_hash, activo
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      )
      .run(nombre, nombreUsuario, email || null, telefono, passwordHash);

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
      u.usuario,
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

/*
 * El administrador edita los datos de un usuario de su empresa:
 * nombre, usuario (login), email, teléfono y clave (opcional).
 * Valida que el usuario/email no estén usados por otra cuenta.
 */
function actualizarUsuario({ usuarioId, empresaId, nombre, usuario, email, telefono, password }) {
  const actual = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(usuarioId);
  if (!actual) {
    const error = new Error("Usuario no encontrado.");
    error.statusCode = 404;
    throw error;
  }
  const pertenece = db
    .prepare("SELECT 1 FROM usuario_empresas WHERE usuario_id = ? AND empresa_id = ?")
    .get(usuarioId, empresaId);
  if (!pertenece) {
    const error = new Error("El usuario no pertenece a esta empresa.");
    error.statusCode = 403;
    throw error;
  }
  const nombreOk = nombre !== undefined && String(nombre).trim() ? String(nombre).trim() : null;
  const usuarioOk = usuario !== undefined ? String(usuario || "").trim().toLowerCase() : undefined;
  const emailOk = email !== undefined ? String(email || "").trim() : undefined;
  const telefonoOk = telefono !== undefined ? String(telefono || "").trim() : undefined;
  const claveOk = password ? String(password) : null;

  if (usuarioOk) {
    const dup = db.prepare("SELECT id FROM usuarios WHERE usuario = ? AND id <> ?").get(usuarioOk, usuarioId);
    if (dup) {
      const error = new Error("Ya existe otro usuario con ese nombre de usuario.");
      error.statusCode = 409;
      throw error;
    }
  }
  if (emailOk) {
    const dup = db.prepare("SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?) AND id <> ?").get(emailOk, usuarioId);
    if (dup) {
      const error = new Error("Ya existe otro usuario con ese email.");
      error.statusCode = 409;
      throw error;
    }
  }
  const transaction = db.transaction(() => {
    if (nombreOk) db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(nombreOk, usuarioId);
    if (usuarioOk !== undefined) db.prepare("UPDATE usuarios SET usuario = ? WHERE id = ?").run(usuarioOk || null, usuarioId);
    if (emailOk !== undefined) db.prepare("UPDATE usuarios SET email = ? WHERE id = ?").run(emailOk || null, usuarioId);
    if (telefonoOk !== undefined) db.prepare("UPDATE usuarios SET telefono = ? WHERE id = ?").run(telefonoOk || null, usuarioId);
    if (claveOk) db.prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(claveOk, 10), usuarioId);
  });
  transaction();
  return getUsuarioById(usuarioId);
}

module.exports = {
  crearUsuario,
  actualizarUsuario,
  getUsuarioById,
  listUsuariosByEmpresa,
  setUsuarioActivo,
  cambiarRolUsuario,
};
