require("dotenv").config();
const fs = require("fs");
const path = require("path");

/*
 * Convierte los dumps MySQL/MariaDB del sistema viejo (gestion_mym) de
 * MATERIALES MESOPOTAMICOS a los CSV que consumen los importadores del ERP.
 *
 * Genera en la carpeta de salida:
 *   - clientes.csv
 *   - productos.csv
 *   - rubros.csv
 *   - marcas.csv
 *   - productos_rubro_marca.csv
 *   - empresa.json          (datos para dar de alta la empresa)
 *   - resumen.txt           (estadísticas de la conversión)
 *
 * Uso:
 *   node scripts/convertir-materiales-mym.js --src="C:\ruta\dumps" \
 *        [--out=data/importacion/materiales] [--precio=historico|markup|costo] \
 *        [--markup=0] [--iva-incluido=true]
 *
 * --precio=historico (recomendado): usa el último precio de venta real del
 *   artículo en detalle_comprobantes_mym.sql; si no hay, cae al costo.
 * --precio=markup : costo * (1 + markup/100).
 * --precio=costo  : precio = costo.
 *
 * --iva-incluido=true (default): los precios del sistema viejo incluyen IVA,
 *   así que se los pasa a neto dividiendo por (1 + iva/100), porque el ERP
 *   guarda el precio neto y suma el IVA al facturar.
 *
 * Los catálogos genéricos (tipocuit, tipodocumento, impuestos, unidmed,
 * provincia, ciudad) no vienen en los dumps de MATERIALES, así que se leen
 * del dump de referencia `bases_mym.sql` (mismo software). No se usa ningún
 * dato de negocio de ese archivo.
 */

function arg(name, def) {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  return found ? found.slice(pref.length) : def;
}
const SRC = arg("src", "C:\\Users\\USUARIO\\Desktop");
const OUT = path.resolve(__dirname, "..", arg("out", "data/importacion/materiales"));
const PRECIO = arg("precio", "historico").toLowerCase();
const MARKUP = Number(arg("markup", "0")) || 0;
const IVA_INCLUIDO = arg("iva-incluido", "true") !== "false";
const ARCHIVOS = {
  bases: arg("bases", "bases_mym.sql"),
  productos: arg("productos", "productos_mym.sql"),
  clientes: arg("clientes", "clientes_mym.sql"),
  rubros: arg("rubros", "rubros_mym.sql"),
  marcas: arg("marcas", "marcas_mym.sql"),
  empresa: arg("empresa", "empresa_mym.sql"),
  comprobantes: arg("comprobantes", "comprobantes_mym.sql"),
  detalle: arg("detalle", "detalle_comprobantes_mym.sql"),
};

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

function leer(nombre) {
  const p = path.join(SRC, nombre);
  if (!fs.existsSync(p)) { console.warn(`  (falta ${nombre})`); return ""; }
  return fs.readFileSync(p, "utf8");
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

/* ------------------------------------------------------------------ */
/* Conversión                                                          */
/* ------------------------------------------------------------------ */

function main() {
  console.log(`Origen : ${SRC}`);
  console.log(`Destino: ${OUT}`);
  console.log(`Precio : ${PRECIO}${PRECIO === "markup" ? ` (${MARKUP}%)` : ""} | IVA incluido en origen: ${IVA_INCLUIDO}`);

  const base = leer(ARCHIVOS.bases); // catálogos genéricos (mismo software)
  const artTxt = leer(ARCHIVOS.productos);
  const cliTxt = leer(ARCHIVOS.clientes);
  const rubTxt = leer(ARCHIVOS.rubros);
  const marTxt = leer(ARCHIVOS.marcas);
  const empTxt = leer(ARCHIVOS.empresa);
  const compTxt = leer(ARCHIVOS.comprobantes);
  const detTxt = leer(ARCHIVOS.detalle);

  // Catálogos
  const tipocuit = new Map(parseReplace(base, "tipocuit").map((r) => [num(r.idtipocuit), String(r.tipocuit || "").trim()]));
  const impuestos = new Map(parseReplace(base, "impuestos").map((r) => [num(r.idimpuesto), num(r.porcentaje)]));
  const unidmed = new Map(parseReplace(base, "unidmed").map((r) => [num(r.idunidmed), String(r.descripcion || "").toUpperCase()]));
  const provincia = new Map(parseReplace(base, "provincia").map((r) => [num(r.id), String(r.provincia_nombre || "").trim()]));
  const ciudad = new Map(parseReplace(base, "ciudad").map((r) => [num(r.id), String(r.ciudad_nombre || "").trim()]));

  const COND = {
    "consumidor final": "CONSUMIDOR FINAL",
    "monotributo": "MONOTRIBUTO",
    "responsable inscripto": "RESPONSABLE INSCRIPTO",
    "exento": "EXENTO",
  };
  const UNIDAD = [
    ["KILOGRAMO", "KG"], ["METRO CUADRADO", "M2"], ["METRO CUBICO", "M3"], ["METROS", "MT"],
    ["LITROS", "L"], ["KILOWATT", "KWH"], ["UNIDAD", "UN"], ["PAR", "PAR"], ["DOCENA", "DOC"],
    ["GRAMO", "GR"], ["MILIMETRO", "MM"], ["KILOMETRO", "KM"], ["HECTOLITRO", "HL"],
    ["CENTIMETRO", "CM"], ["TONELADA", "TN"], ["MILILITRO", "ML"], ["MILIGRAMO", "MG"],
  ];
  function unidadDe(idunidmed) {
    const d = unidmed.get(num(idunidmed));
    if (!d) return "UN";
    for (const [k, v] of UNIDAD) if (d.includes(k)) return v;
    return "UN";
  }
  function ivaDe(idtipoiva) {
    const p = impuestos.get(num(idtipoiva));
    return p == null ? 21 : p;
  }

  // Precios históricos: último puni por idart (según fecha del comprobante)
  const fechaCompro = new Map(parseReplace(compTxt, "compro").map((r) => [num(r.idcompro), String(r.fecha || "")]));
  const hist = new Map(); // idart -> { fecha, puni, iva, descripcion }
  for (const d of parseReplace(detTxt, "detcompro")) {
    const idart = num(d.idart);
    const puni = num(d.puni);
    if (!idart || puni <= 0) continue;
    const fecha = fechaCompro.get(num(d.idcompro)) || "";
    const prev = hist.get(idart);
    if (!prev || fecha > prev.fecha) {
      hist.set(idart, { fecha, puni, iva: ivaDe(d.idtipoiva), descripcion: String(d.descripcion || "").trim() });
    }
  }

  const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  const revision = [["codigo", "descripcion_actual", "descripcion_historica", "precio_historico", "costo"]];

  // Empresa
  const emp = parseReplace(empTxt, "empresa")[0] || {};
  const empresa = {
    nombre: String(emp.nombre || "").trim(),
    cuit: soloDigitos(emp.cuit),
    condicionIva: COND[String(tipocuit.get(num(emp.idtipocuit)) || "").toLowerCase()] || "RESPONSABLE INSCRIPTO",
    direccion: String(emp.direccion || "").trim(),
    telefono: String(emp.telefono || "").trim(),
    celular: String(emp.celular || "").trim(),
    email: String(emp.mail || "").trim(),
    nombreDueno: String(emp.nombre_dueno || "").trim(),
    inicioActividad: String(emp.inicio_actividad || "").trim(),
    provincia: provincia.get(num(emp.idprovincia)) || "",
    localidad: ciudad.get(num(emp.idciudad)) || "",
  };

  // Clientes
  const clientes = [["nombre", "cuit", "dni", "condicioniva", "domicilio", "localidad", "provincia", "email", "telefono", "descuento"]];
  let cliErr = 0, cliDoc = 0;
  for (const c of parseReplace(cliTxt, "clientes")) {
    const nombre = String(c.apnom || "").trim();
    if (!nombre) { cliErr++; continue; }
    const tipodoc = num(c.tipodoc);
    const dig = soloDigitos(c.cuit);
    let cuit = "", dni = "";
    if (tipodoc === 3 && dig.length === 11) cuit = dig;
    else if ((tipodoc === 1 || tipodoc === 3) && dig.length >= 6) dni = dig;
    if (cuit || dni) cliDoc++;
    const cond = COND[String(tipocuit.get(num(c.idtipocuit)) || "").toLowerCase()] || "CONSUMIDOR FINAL";
    const tel = String(c.tel || "").trim();
    const cel = String(c.cel || "").trim();
    const mail = String(c.mail || "").trim();
    clientes.push([
      nombre, cuit, dni, cond, String(c.dir || "").trim(),
      ciudad.get(num(c.idciudad)) || "", provincia.get(num(c.idprovincia)) || "",
      mail.includes("@") ? mail : "", (tel && tel !== "0" ? tel : cel) || "", "0",
    ]);
  }

  // Productos + asociación rubro/marca
  const productos = [["codigo", "codigoBarra", "descripcion", "precio", "costo", "iva", "unidad"]];
  const prodRubro = [["codigo", "idrubro", "idmarca", "idsubrubro"]];
  let pSinCod = 0, pSinDesc = 0, pCero = 0, pHist = 0, pFallback = 0;
  const vistos = new Set();
  for (const a of parseReplace(artTxt, "articulos")) {
    const descripcion = String(a.descrip || "").trim();
    if (!descripcion) { pSinDesc++; continue; }
    if (/^0+$/.test(descripcion)) { pCero++; continue; }
    let codigo = String(a.codinterno || "").trim() || String(a.codbarra || "").trim();
    if (!codigo || codigo === "0") { codigo = `ART-${num(a.idart)}`; pSinCod++; }
    const key = codigo.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);

    const costo = num(a.pcosto);
    const iva = ivaDe(a.idtipoiva);
    let precio;
    if (PRECIO === "costo") {
      precio = costo;
    } else if (PRECIO === "markup") {
      precio = costo * (1 + MARKUP / 100);
    } else {
      const h = hist.get(num(a.idart));
      if (h) {
        precio = IVA_INCLUIDO && iva > 0 ? h.puni / (1 + iva / 100) : h.puni;
        pHist++;
      } else {
        precio = costo * (1 + MARKUP / 100);
        pFallback++;
      }
    }
    productos.push([codigo, "", descripcion, money(precio), money(costo), String(iva), unidadDe(a.idunidmed)]);
    prodRubro.push([codigo, String(num(a.idrubro)), String(num(a.idmarca)), String(num(a.idsubrubro))]);
  }

  // Rubros y marcas
  const rubros = [["id", "nombre"]];
  for (const r of parseReplace(rubTxt, "rubros")) {
    const id = num(r.idrubro), nom = String(r.rubro || "").trim();
    if (id > 0 && nom) rubros.push([String(id), nom]);
  }
  const marcas = [["id", "nombre"]];
  for (const r of parseReplace(marTxt, "marcas")) {
    const id = num(r.idmarca), nom = String(r.marca || "").trim();
    if (id > 0 && nom) marcas.push([String(id), nom]);
  }

  // Escritura
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "clientes.csv"), csv(clientes), "utf8");
  fs.writeFileSync(path.join(OUT, "productos.csv"), csv(productos), "utf8");
  fs.writeFileSync(path.join(OUT, "rubros.csv"), csv(rubros), "utf8");
  fs.writeFileSync(path.join(OUT, "marcas.csv"), csv(marcas), "utf8");
  fs.writeFileSync(path.join(OUT, "productos_rubro_marca.csv"), csv(prodRubro), "utf8");
  if (empTxt) fs.writeFileSync(path.join(OUT, "empresa.json"), JSON.stringify(empresa, null, 2), "utf8");

  const resumen = [
    empTxt ? `Empresa: ${empresa.nombre} (CUIT ${empresa.cuit}) - ${empresa.condicionIva}` : "Empresa: (sin dump de empresa)",
    `Clientes: ${clientes.length - 1} (con documento: ${cliDoc}, sin nombre/omitidos: ${cliErr})`,
    `Productos: ${productos.length - 1} (precio histórico: ${pHist}, por costo/markup: ${pFallback}, sin descripción: ${pSinDesc}, placeholder 000: ${pCero}, sin código (autogenerado): ${pSinCod})`,
    `Rubros: ${rubros.length - 1}`,
    `Marcas: ${marcas.length - 1}`,
    `Precios: modo=${PRECIO} markup=${MARKUP}% iva_incluido_origen=${IVA_INCLUIDO}`,
  ].join("\r\n");
  fs.writeFileSync(path.join(OUT, "resumen.txt"), resumen + "\r\n", "utf8");

  console.log("\n" + resumen);
  console.log(`\nArchivos generados en: ${OUT}`);
}

main();
