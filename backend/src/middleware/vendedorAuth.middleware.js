const crypto = require("crypto");
const db = require("../db/database");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function tokenDe(req) {
  const header = String(req.get("authorization") || "");
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  const cookies = String(req.headers?.cookie || "").split(";");
  for (const cookie of cookies) {
    const [nombre, ...resto] = cookie.trim().split("=");
    if (nombre === "pixe_vendedor") return decodeURIComponent(resto.join("="));
  }
  return "";
}

function vendedorAuth(req, res, next) {
  const token = tokenDe(req);
  if (!token) return res.status(401).json({ ok: false, error: "Falta el token de vendedor." });

  const fila = db
    .prepare(
      `SELECT t.*,u.nombre usuario_nombre,u.email,u.usuario,u.activo usuario_activo,
              e.nombre empresa_nombre,e.activa empresa_activa,e.tema empresa_tema
       FROM vendedor_tokens t
       JOIN usuarios u ON u.id=t.usuario_id
       JOIN empresas e ON e.id=t.empresa_id
       WHERE t.token_hash=? AND t.activo=1`,
    )
    .get(hashToken(token));

  if (!fila) return res.status(401).json({ ok: false, error: "Token inválido. Pedí un código nuevo." });
  if (new Date(fila.expira_en).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, error: "Token vencido. Pedí un código nuevo." });
  }
  if (!fila.usuario_activo || !fila.empresa_activa) {
    return res.status(401).json({ ok: false, error: "Usuario o empresa inactivos." });
  }
  const pertenece = db
    .prepare("SELECT 1 FROM usuario_empresas WHERE usuario_id=? AND empresa_id=? AND activo=1")
    .get(fila.usuario_id, fila.empresa_id);
  if (!pertenece) {
    return res.status(403).json({ ok: false, error: "El usuario ya no pertenece a la empresa." });
  }

  const vendedor = db
    .prepare("SELECT id,nombre FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1")
    .get(fila.empresa_id, fila.usuario_id);
  if (!vendedor) {
    return res.status(403).json({ ok: false, error: "Tu usuario ya no está vinculado a un vendedor." });
  }

  db.prepare("UPDATE vendedor_tokens SET ultimo_uso=? WHERE id=?").run(new Date().toISOString(), fila.id);

  req.tokenVendedor = fila;
  req.usuario = { id: fila.usuario_id, nombre: fila.usuario_nombre, email: fila.email || fila.usuario || null };
  req.empresa = { id: fila.empresa_id, nombre: fila.empresa_nombre, tema: fila.empresa_tema || "lavanda" };
  req.vendedor = vendedor;
  next();
}

module.exports = vendedorAuth;
