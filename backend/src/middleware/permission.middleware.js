const { usuarioTienePermiso } = require("../repositories/security.repository");

function requirePermission(permission) {
  return function (req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({
        ok: false,
        error: "Usuario no autenticado",
      });
    }

    const permisos = req.permisos || [];

    if (!permisos.includes(permission)) {
      return res.status(403).json({
        ok: false,
        error: "Permiso insuficiente",
        permiso: permission,
      });
    }

    next();
  };
}

module.exports = requirePermission;
