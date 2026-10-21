const COOKIE_VENDEDOR = "pixe_vendedor_refresh";

function leerRefreshToken(req) {
  const cookies = String(req.headers?.cookie || "").split(";");
  for (const cookie of cookies) {
    const [nombre, ...resto] = cookie.trim().split("=");
    if (nombre === COOKIE_VENDEDOR) return decodeURIComponent(resto.join("="));
  }
  return "";
}

module.exports = { COOKIE_VENDEDOR, leerRefreshToken };
