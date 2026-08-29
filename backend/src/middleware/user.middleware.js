const {
  getUsuarioByEmail,
  usuarioPerteneceAEmpresa,
} = require("../repositories/security.repository");

function userMiddleware(req, res, next) {
  const email = req.headers["x-user-email"];

  if (!email) {
    return res.status(401).json({
      ok: false,
      error: "Falta header x-user-email",
    });
  }

  const usuario = getUsuarioByEmail(email);

  if (!usuario) {
    return res.status(401).json({
      ok: false,
      error: "Usuario no encontrado o inactivo",
    });
  }

  const pertenece = usuarioPerteneceAEmpresa({
    usuarioId: usuario.id,
    empresaId: req.empresa.id,
  });

  if (!pertenece) {
    return res.status(403).json({
      ok: false,
      error: "Usuario no pertenece a esta empresa",
    });
  }

  req.usuario = usuario;

  next();
}

module.exports = userMiddleware;
