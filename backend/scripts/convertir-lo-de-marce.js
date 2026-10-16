require("dotenv").config();
const fs = require("fs");
const path = require("path");

/*
 * Convierte el dump MySQL del sistema viejo de LO DE MARCE CARNES
 * (base.sql, exportado con HeidiSQL en latin1) a los CSV que consume el
 * importador del ERP (scripts/importar-lo-de-marce.js o el panel de
 * superadmin: Empresa → Importar productos).
 *
 * Genera en la carpeta de salida:
 *   - productos.csv   (codigo, codigobarra, descripcion, precio, iva, costo, unidad, rubro)
 *   - rubros.csv      (id, nombre)
 *   - empresa.json    (datos para el alta de la empresa y el punto de venta)
 *   - resumen.txt     (estadísticas de la conversión)
 *
 * Uso:
 *   node scripts/convertir-lo-de-marce.js ["--src=C:\ruta\base.sql"]
 *        [--out=data/importacion/lodemarce] [--iva=0]
 *
 * Criterios de conversión:
 *   - codigo       = idart del sistema viejo (búsqueda rápida en el POS).
 *   - codigo_barra = codbarra solo si parece un EAN real (8 a 14 dígitos)
 *                    y no está repetido; el resto queda vacío.
 *   - precio       = pfinal1 (el precio de góndola actual tal cual se cobra).
 *   - costo        = pcosto.
 *   - iva          = --iva (0 por defecto: el precio guardado ya incluye IVA).
 *   - rubro        = nombre del rubro de la tabla `rubros` ("NO POSEE" → vacío).
 */

function arg(name, def) {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  return found ? found.slice(pref.length) : def;
}
const SRC = arg("src", "C:\\Users\\USUARIO\\Desktop\\lodemarcecertificados\\base.sql");
const OUT = path.resolve(__dirname, "..", arg("out", "data/importacion/lodemarce"));
const IVA = Number(arg("iva", "0")) || 0;

/* ------------------------------------------------------------------ */
/* Parser de dumps MySQL (REPLACE INTO ... VALUES (...),(...);)        */
/* ------------------------------------------------------------------ */

function decodeString(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\") {
      const n = raw[i + 1];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "0") out += "\0";
      else out += n === undefined ? "" : n;
      i++;
    } else if (ch === "'" && raw[i + 1] === "'") {
      out += "'";
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

function decodeValue(raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (v === "" || v.toUpperCase() === "NULL") return null;
  if (/^_binary\s/i.test(v)) return null;
  if (v.startsWith("'")) return decodeString(v.slice(1, -1));
  return v;
}

function parseReplace(text, table) {
  const records = [];
  const re = new RegExp("REPLACE INTO `" + table + "`\\s*\\(([^)]*)\\)\\s*VALUES", "g");
  let m;
  while ((m = re.exec(text))) {
    const cols = m[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    let i = re.lastIndex;
    let depth = 0, inStr = false, field = "", tuple = null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (ch === "\\") { field += ch + (text[i + 1] || ""); i++; continue; }
        if (ch === "'") { inStr = false; field += ch; continue; }
        field += ch; continue;
      }
      if (ch === "'") { inStr = true; field += ch; continue; }
      if (ch === "(") { depth++; if (depth === 1) { tuple = []; field = ""; } continue; }
      if (ch === ")") {
        depth--;
        if (depth === 0 && tuple) { tuple.push(field); records.push({ cols, tuple }); tuple = null; field = ""; }
        continue;
      }
      if (ch === "," && depth === 1 && tuple) { tuple.push(field); field = ""; continue; }
      if (ch === ";" && depth === 0) break;
      if (depth >= 1) field += ch;
    }
    re.lastIndex = i + 1;
  }
  return records.map(({ cols, tuple }) => {
    const o = {};
    cols.forEach((c, idx) => { o[c] = decodeValue(tuple[idx]); });
    return o;
  });
}

/* ------------------------------------------------------------------ */
/* Utilidades CSV                                                      */
/* ------------------------------------------------------------------ */

function csv(rows) {
  return rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
function num(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function money(v) { return (Math.round(num(v) * 100) / 100).toFixed(2); }
function soloDigitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
function limpiarTexto(v) { return String(v == null ? "" : v).trim().replace(/\s+/g, " "); }

const UNIDAD = [
  ["KILOGRAMO", "KG"], ["KILOS", "KG"], ["KILO", "KG"], ["METRO CUBICO", "M3"], ["METRO CUADRADO", "M2"],
  ["METROS", "MT"], ["METRO", "MT"], ["LITROS", "L"], ["LITRO", "L"], ["UNIDADES", "UN"], ["UNIDAD", "UN"],
  ["PAR", "PAR"], ["DOCENA", "DOC"], ["GRAMO", "GR"], ["MILIMETRO", "MM"], ["KILOMETRO", "KM"],
  ["CENTIMETRO", "CM"], ["TONELADA", "TN"], ["MILILITRO", "ML"], ["MILIGRAMO", "MG"],
];
function unidadDe(valor) {
  const d = limpiarTexto(valor).toUpperCase();
  if (!d) return "UN";
  for (const [k, v] of UNIDAD) if (d.includes(k)) return v;
  return "UN";
}

/* ------------------------------------------------------------------ */
/* Conversión                                                          */
/* ------------------------------------------------------------------ */

const EMPRESA = {
  nombre: "Lo de Marce Carnes",
  razonSocial: "Lo de Marce Carnes",
  cuit: "20318111155",
  condicionIva: "MONOTRIBUTO",
  ingresosBrutos: "20318111155",
  direccion: "Neuquen 137",
  localidad: "Neuquén",
  provincia: "Neuquén",
  telefono: "3454288996",
  email: "marce@pixesistemas.com.ar",
  puntoVenta: 2,
  usuarioAdmin: "marce@pixesistemas.com.ar",
};

function main() {
  console.log(`Origen : ${SRC}`);
  console.log(`Destino: ${OUT}`);
  console.log(`IVA    : ${IVA}%`);

  if (!fs.existsSync(SRC)) {
    console.error(`No existe el archivo de origen: ${SRC}`);
    process.exit(1);
  }
  /* El dump viene en latin1 (HeidiSQL): se lee como latin1 para no romper acentos. */
  const text = fs.readFileSync(SRC, "latin1");

  const rubros = new Map();
  for (const r of parseReplace(text, "rubros")) {
    const id = num(r.idrubro), nombre = limpiarTexto(r.rubro);
    if (id > 0 && nombre) rubros.set(id, nombre);
  }

  const productos = [["codigo", "codigobarra", "descripcion", "precio", "iva", "costo", "unidad", "rubro"]];
  const barrasUsadas = new Set();
  const descripciones = new Map();
  const codigosVistos = new Set();
  let sinDesc = 0, sinPrecio = 0, sinCosto = 0, barraOk = 0, barraDesc = 0, barraDup = 0, sinRubro = 0, artTotal = 0;

  for (const a of parseReplace(text, "articulos")) {
    artTotal++;
    const descripcion = limpiarTexto(a.descrip);
    if (!descripcion) { sinDesc++; continue; }
    const codigo = String(num(a.idart));
    if (!codigo || codigo === "0" || codigosVistos.has(codigo)) continue;
    codigosVistos.add(codigo);

    const costo = num(a.pcosto);
    if (costo <= 0) sinCosto++;
    const precio = num(a.pfinal1) > 0 ? num(a.pfinal1) : num(a.precio1);
    if (precio <= 0) sinPrecio++;

    let barra = "";
    const dig = soloDigitos(a.codbarra);
    if (dig.length >= 8 && dig.length <= 14 && !/^0+$/.test(dig)) {
      if (barrasUsadas.has(dig)) barraDup++;
      else { barrasUsadas.add(dig); barra = dig; barraOk++; }
    } else if (dig) {
      barraDesc++;
    }

    let rubro = rubros.get(num(a.idrubro)) || "";
    if (rubro && /^no posee$/i.test(rubro)) rubro = "";
    if (!rubro) sinRubro++;

    const clave = descripcion.toUpperCase();
    descripciones.set(clave, (descripciones.get(clave) || 0) + 1);

    productos.push([codigo, barra, descripcion, money(precio), String(IVA), money(costo), unidadDe(a.unidad), rubro]);
  }
  const descDup = [...descripciones.values()].filter((n) => n > 1).length;

  const rubrosCsv = [["id", "nombre"]];
  let rubrosUtiles = 0;
  for (const [id, nombre] of [...rubros.entries()].sort((x, y) => x[0] - y[0])) {
    if (/^no posee$/i.test(nombre)) continue;
    rubrosCsv.push([String(id), nombre]);
    rubrosUtiles++;
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "productos.csv"), csv(productos), "utf8");
  fs.writeFileSync(path.join(OUT, "rubros.csv"), csv(rubrosCsv), "utf8");
  fs.writeFileSync(path.join(OUT, "empresa.json"), JSON.stringify(EMPRESA, null, 2), "utf8");

  const resumen = [
    `Empresa: ${EMPRESA.nombre} (CUIT ${EMPRESA.cuit}) - ${EMPRESA.condicionIva} - punto de venta ${EMPRESA.puntoVenta}`,
    `Artículos en el dump: ${artTotal}`,
    `Productos exportados: ${productos.length - 1} (sin descripción: ${sinDesc})`,
    `Productos con precio 0: ${sinPrecio} | con costo 0: ${sinCosto}`,
    `Códigos de barras válidos: ${barraOk} | descartados (basura): ${barraDesc} | duplicados descartados: ${barraDup}`,
    `Rubros del dump: ${rubros.size} (útiles: ${rubrosUtiles}) | productos sin rubro: ${sinRubro}`,
    `Descripciones repetidas (mismo nombre en varios códigos): ${descDup}`,
    `IVA aplicado a todos: ${IVA}%`,
  ].join("\r\n");
  fs.writeFileSync(path.join(OUT, "resumen.txt"), resumen + "\r\n", "utf8");

  console.log("\n" + resumen);
  console.log(`\nArchivos generados en: ${OUT}`);
}

main();
