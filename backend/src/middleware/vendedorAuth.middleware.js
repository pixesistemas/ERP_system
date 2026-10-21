const db = require("../db/database");
const { getRefreshToken } = require("../repositories/refreshToken.repository");
const { leerRefreshToken } = require("../utils/vendedorCookie");

function requireVendedor(req, res, next) {
  const refreshToken = leerRefreshToken(req);
  const sesion = refreshToken ? getRefreshToken(refreshToken) : null;
  if (!sesion) {
    return res.status(401).json({ ok: false, error: "Sesión cerrada o revocada. Iniciá sesión de nuevo." });
  }
  if (new Date(sesion.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, error: "Sesión vencida. Iniciá sesión de nuevo." });
  }
  if (
    Number(sesion.usuario_id) !== Number(req.usuario?.id) ||
    Number(sesion.empresa_id) !== Number(req.empresa?.id)
  ) {
    return res.status(401).json({ ok: false, error: "La sesión no corresponde a este usuario." });
  }

  const vendedor = db
    .prepare("SELECT id,nombre FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1")
    .get(req.empresa.id, req.usuario.id);
  if (!vendedor) {
    return res.status(403).json({ ok: false, error: "Tu usuario no está vinculado a un vendedor activo." });
  }

  req.vendedor = vendedor;
  next();
}

module.exports = requireVendedor;
