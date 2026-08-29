const jwt = require("jsonwebtoken");

const { getEmpresaByNombre } = require("../repositories/empresa.repository");

const {
  getUsuarioByEmail,
  usuarioPerteneceAEmpresa,
  getPermisosUsuario,
} = require("../repositories/security.repository");

function jwtMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: "Falta token JWT",
    });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const usuario = getUsuarioByEmail(decoded.email);

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        error: "Usuario inválido o inactivo",
      });
    }

    const empresa = getEmpresaByNombre(decoded.empresaNombre);

    if (!empresa || empresa.activa === false) {
      return res.status(401).json({
        ok: false,
        error: "Empresa inválida o inactiva",
      });
    }

    const pertenece = usuarioPerteneceAEmpresa({
      usuarioId: usuario.id,
      empresaId: empresa.id,
    });

    if (!pertenece) {
      return res.status(403).json({
        ok: false,
        error: "Usuario no pertenece a esta empresa",
      });
    }

    const permisos = getPermisosUsuario({
      usuarioId: usuario.id,
      empresaId: empresa.id,
    });

    req.usuario = usuario;
    req.empresa = empresa;
    req.permisos = permisos;

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "Token inválido o vencido",
    });
  }
}

module.exports = jwtMiddleware;
