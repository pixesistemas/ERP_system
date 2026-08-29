function parseCsv(texto) {
  if (!texto || !String(texto).trim()) return [];
  const contenido = String(texto).replace(/^\uFEFF/, "");
  const primera = (contenido.split("\n")[0] || "");
  const semicolons = (primera.match(/;/g) || []).length;
  const commas = (primera.match(/,/g) || []).length;
  const sep = semicolons >= commas && semicolons > 0 ? ";" : ",";

  const filas = [];
  let fila = [], campo = "", enComillas = false;
  for (let i = 0; i < contenido.length; i++) {
    const ch = contenido[i];
    if (enComillas) {
      if (ch === '"') {
        if (contenido[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += ch;
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === sep) {
      fila.push(campo); campo = "";
    } else if (ch === "\n") {
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else if (ch !== "\r") {
      campo += ch;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => String(c).trim() !== ""));
}

function headerIndex(headers, ...nombres) {
  const norm = (h) => String(h || "").toLowerCase().replace(/[\s_\-áéíóúñ]/g, (m) => ({ "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n" }[m] || ""));
  for (const n of nombres) {
    const k = norm(n);
    const idx = headers.findIndex((h) => norm(h) === k);
    if (idx >= 0) return idx;
  }
  return -1;
}

function valorFila(fila, headers, idx) {
  if (idx < 0 || idx >= fila.length) return "";
  return String(fila[idx] || "").trim();
}

module.exports = { parseCsv, headerIndex, valorFila };