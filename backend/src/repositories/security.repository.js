const db = require("../db/database");

function getUsuarioByEmail(email) {
  return db
    .prepare(
      `
    SELECT *
    FROM usuarios
    WHERE email = ?
      AND activo = 1
  `,
    )
    .get(email);
}

function getUsuarioByTelefono(telefono) {
  return db
    .prepare(
      `
    SELECT *
    FROM usuarios
    WHERE telefono = ?
      AND activo = 1
  `,
    )
    .get(telefono);
}

function usuarioPerteneceAEmpresa({ usuarioId, empresaId }) {
  const row = db
    .prepare(
      `
    SELECT *
    FROM usuario_empresas
    WHERE usuario_id = ?
      AND empresa_id = ?
      AND activo = 1
  `,
    )
    .get(usuarioId, empresaId);

  return !!row;
}

function getPermisosUsuario({ usuarioId, empresaId }) {
  const rows = db
    .prepare(
      `
    SELECT DISTINCT p.codigo
    FROM usuario_roles ur
    INNER JOIN roles r ON r.id = ur.rol_id
    INNER JOIN rol_permisos rp ON rp.rol_id = r.id
    INNER JOIN permisos p ON p.id = rp.permiso_id
    WHERE ur.usuario_id = ?
      AND ur.empresa_id = ?
  `,
    )
    .all(usuarioId, empresaId);

  return rows.map((row) => row.codigo);
}

function usuarioTienePermiso({ usuarioId, empresaId, permiso }) {
  const row = db
    .prepare(
      `
    SELECT p.codigo
    FROM usuario_roles ur
    INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
    INNER JOIN permisos p ON p.id = rp.permiso_id
    WHERE ur.usuario_id = ?
      AND ur.empresa_id = ?
      AND p.codigo = ?
    LIMIT 1
  `,
    )
    .get(usuarioId, empresaId, permiso);

  return !!row;
}

module.exports = {
  getUsuarioByEmail,
  getUsuarioByTelefono,
  usuarioPerteneceAEmpresa,
  getPermisosUsuario,
  usuarioTienePermiso,
};
