const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/database");

const {
  getUsuarioByEmail,
  usuarioPerteneceAEmpresa,
  getPermisosUsuario,
} = require("../repositories/security.repository");

const {
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
} = require("../repositories/refreshToken.repository");

const { getEmpresaByNombre } = require("../repositories/empresa.repository");

function login({ email, password, empresaNombre }) {
  const usuario = getUsuarioByEmail(email);

  if (!usuario) {
    const error = new Error("Usuario o contraseña inválidos");
    error.statusCode = 401;
    throw error;
  }

  const passwordOk = bcrypt.compareSync(password, usuario.password_hash || "");

  if (!passwordOk) {
    const error = new Error("Usuario o contraseña inválidos");
    error.statusCode = 401;
    throw error;
  }

  let empresa;

  if (empresaNombre) {
    empresa = getEmpresaByNombre(empresaNombre);
  } else {
    const primeraDeUsuario = db
      .prepare(
        `
      SELECT e.*
      FROM usuario_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND ue.activo = 1
        AND e.activa = 1
      ORDER BY ue.id LIMIT 1
    `,
      )
      .get(usuario.id);

    if (primeraDeUsuario) {
      empresa = primeraDeUsuario;
    } else {
      empresa = getEmpresaByNombre(empresaNombre || "empresa1");
    }
  }

  const pertenece = usuarioPerteneceAEmpresa({
    usuarioId: usuario.id,
    empresaId: empresa.id,
  });

  if (!pertenece) {
    const error = new Error("Usuario no pertenece a la empresa");
    error.statusCode = 403;
    throw error;
  }

  const permisos = getPermisosUsuario({
    usuarioId: usuario.id,
    empresaId: empresa.id,
  });

  const token = jwt.sign(
    {
      usuarioId: usuario.id,
      email: usuario.email,
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      permisos,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    },
  );
  const refreshToken = createRefreshToken({
    usuarioId: usuario.id,
    empresaId: empresa.id,
  });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    },
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      tema: empresa.tema || "lavanda",
    },
    permisos,
    refreshToken,
  };
}
function refresh({ refreshToken }) {
  const stored = getRefreshToken(refreshToken);

  if (!stored) {
    const error = new Error("Refresh token inválido");
    error.statusCode = 401;
    throw error;
  }

  if (new Date(stored.expires_at) < new Date()) {
    revokeRefreshToken(refreshToken);

    const error = new Error("Refresh token vencido");
    error.statusCode = 401;
    throw error;
  }

  const usuario = db
    .prepare(
      `
    SELECT *
    FROM usuarios
    WHERE id = ?
      AND activo = 1
  `,
    )
    .get(stored.usuario_id);

  const empresa = db
    .prepare(
      `
    SELECT *
    FROM empresas
    WHERE id = ?
      AND activa = 1
  `,
    )
    .get(stored.empresa_id);

  const permisos = getPermisosUsuario({
    usuarioId: usuario.id,
    empresaId: empresa.id,
  });

  const token = jwt.sign(
    {
      usuarioId: usuario.id,
      email: usuario.email,
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      permisos,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    },
  );

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    },
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      tema: empresa.tema || "lavanda",
    },
    permisos,
  };
}
function logout({ refreshToken }) {
  if (!refreshToken) {
    const error = new Error("Debe informar refreshToken");
    error.statusCode = 400;
    throw error;
  }

  revokeRefreshToken(refreshToken);

  return {
    message: "Sesión cerrada correctamente",
  };
}

module.exports = {
  login,
  refresh,
  logout,
};
