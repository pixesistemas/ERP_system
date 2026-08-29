const jwt = require("jsonwebtoken");

function superadminMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "SUPERADMIN") {
      return res.status(403).json({ ok: false, error: "No autorizado para el panel de administración" });
    }
    req.superadmin = { id: decoded.saId, usuario: decoded.usuario, nombre: decoded.nombre };
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Token inválido o vencido" });
  }
}

module.exports = superadminMiddleware;