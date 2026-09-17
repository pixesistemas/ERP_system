/*
 * URLs públicas de archivos (PDF/QR).
 *
 * PUBLIC_BASE_URL puede venir mal escrita (ej: "https//host" sin dos puntos)
 * o con barras finales; estas funciones la normalizan y arman la URL final
 * sin duplicar prefijos cuando el archivo ya es una URL absoluta.
 */

function basePublica() {
  return String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/g, "")
    .replace(/^(https?):?\/\/?/i, "$1://");
}

function urlPublica(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  const normalizada = value.replace(/^(https?):?\/\/?/i, "$1://");
  if (/^https?:\/\//i.test(normalizada)) return normalizada;
  const base = basePublica();
  if (!base) return normalizada;
  return base + (normalizada.startsWith("/") ? normalizada : `/${normalizada}`);
}

module.exports = { basePublica, urlPublica };
