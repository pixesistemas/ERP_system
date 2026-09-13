require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../src/db/database");
const { parseCsv, headerIndex, valorFila } = require("../src/utils/csv");

/*
 * Asocia rubros y marcas a los productos de Lubritotal.
 *
 * Los catálogos viven en el recurso `afip_catalogs_v34` (tabla app_state),
 * que es el que usan las pantallas de Productos y "Rubros, subrubros y
 * marcas". El producto guarda rubro_id / marca_id apuntando a esos ids.
 *
 * Datos de entrada (en data/importacion):
 *   - rubros.csv ................ id,nombre
 *   - marcas.csv ................ id,nombre
 *   - productos_rubro_marca.csv . codigo,idrubro,idmarca,idsubrubro
 *     (generado del dump articulos.sql del sistema viejo)
 *
 * Uso:
 *   node scripts/importar-rubros-marcas.js <empresaNombreOId> [--dry-run]
 *
 * Es idempotente: reutiliza los catálogos por nombre y vuelve a aplicar la
 * asociación a los productos sin duplicar nada.
 */

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const EMPRESA_BUSCADA = args[0] || process.env.IMPORT_EMPRESA || "Lubritotal";
const DIR = path.join(__dirname, "../data/importacion");
const MARCA_OFFSET = 1000;

function buscarEmpresa(valor) {
  if (/^\d+$/.test(String(valor))) {
    const porId = db.prepare("SELECT id, nombre FROM empresas WHERE id=?").get(Number(valor));
    if (porId) return porId;
  }
  return (
    db.prepare("SELECT id, nombre FROM empresas WHERE nombre = ? COLLATE NOCASE").get(valor) ||
    db.prepare("SELECT id, nombre FROM empresas WHERE nombre LIKE ? ORDER BY id LIMIT 1").get(`%${valor}%`)
  );
}

function leerCatalogo(archivo) {
  if (!fs.existsSync(archivo)) return [];
  const filas = parseCsv(fs.readFileSync(archivo, "utf8"));
  const h = filas[0];
  const iId = headerIndex(h, "id");
  const iNom = headerIndex(h, "nombre", "rubro", "marca");
  return filas
    .slice(1)
    .map((f) => ({ id: Number(valorFila(f, h, iId)), nombre: String(valorFila(f, h, iNom) || "").trim() }))
    .filter((x) => x.id > 0 && x.nombre);
}

function main() {
  const empresa = buscarEmpresa(EMPRESA_BUSCADA);
  if (!empresa) {
    console.error(`No encontré la empresa "${EMPRESA_BUSCADA}".`);
    process.exit(1);
  }
  const e = empresa.id;
  console.log(`Empresa destino: ${empresa.nombre} (id ${e})${dryRun ? "  [DRY-RUN: no se escribe nada]" : ""}`);

  const rubros = leerCatalogo(path.join(DIR, "rubros.csv"));
  const marcas = leerCatalogo(path.join(DIR, "marcas.csv"));
  if (!rubros.length && !marcas.length) {
    console.error(`No hay catálogos en ${DIR}.`);
    process.exit(1);
  }

  const row = db.prepare("SELECT valor_json FROM app_state WHERE empresa_id=? AND clave=?").get(e, "afip_catalogs_v34");
  let catalogs = [];
  try {
    catalogs = JSON.parse(row?.valor_json || "[]");
  } catch {
    catalogs = [];
  }
  if (!Array.isArray(catalogs)) catalogs = [];

  const usados = new Set(catalogs.map((c) => String(c.id)));
  const porNombre = new Map(
    catalogs.map((c) => [`${String(c.tipo || "").toUpperCase()}|${String(c.nombre || "").trim().toLowerCase()}`, c.id]),
  );
  let maxId = catalogs.reduce((n, c) => Math.max(n, Number(c.id) || 0), 0);

  const idRubro = new Map();
  const idMarca = new Map();

  function asignar(tipo, oldId, nombre, offset) {
    const clave = `${tipo}|${nombre.toLowerCase()}`;
    if (porNombre.has(clave)) return porNombre.get(clave);
    let id = offset ? offset + oldId : oldId;
    if (usados.has(String(id))) id = ++maxId;
    else maxId = Math.max(maxId, id);
    usados.add(String(id));
    catalogs.push({ id, tipo, nombre, rubroId: null });
    porNombre.set(clave, id);
    return id;
  }

  for (const r of rubros) idRubro.set(r.id, asignar("RUBRO", r.id, r.nombre, 0));
  for (const m of marcas) idMarca.set(m.id, asignar("MARCA", m.id, m.nombre, MARCA_OFFSET));

  const archivoProd = path.join(DIR, "productos_rubro_marca.csv");
  let match = 0, conRubro = 0, conMarca = 0, sinProducto = 0;
  const buscar = db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?");
  const upd = db.prepare("UPDATE productos SET rubro_id=?, marca_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?");

  if (fs.existsSync(archivoProd)) {
    const filas = parseCsv(fs.readFileSync(archivoProd, "utf8"));
    const h = filas[0];
    const iCod = headerIndex(h, "codigo");
    const iRub = headerIndex(h, "idrubro");
    const iMar = headerIndex(h, "idmarca");
    const aplicar = db.transaction(() => {
      for (const f of filas.slice(1)) {
        const cod = String(valorFila(f, h, iCod) || "").trim();
        const rub = Number(valorFila(f, h, iRub) || 0);
        const mar = Number(valorFila(f, h, iMar) || 0);
        const prod = buscar.get(e, cod);
        if (!prod) {
          sinProducto++;
          continue;
        }
        match++;
        const rubroId = rub > 0 ? idRubro.get(rub) ?? null : null;
        const marcaId = mar > 0 ? idMarca.get(mar) ?? null : null;
        if (rubroId) conRubro++;
        if (marcaId) conMarca++;
        if (!dryRun) upd.run(rubroId, marcaId, prod.id, e);
      }
    });
    aplicar();
  }

  if (!dryRun) {
    db.prepare(
      `INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json,updated_at=CURRENT_TIMESTAMP`,
    ).run(e, "afip_catalogs_v34", JSON.stringify(catalogs));
  }

  console.log(`Catálogos: ${rubros.length} rubros, ${marcas.length} marcas.`);
  console.log(`Productos asociados: ${match} (${conRubro} con rubro, ${conMarca} con marca)${sinProducto ? `, ${sinProducto} del dump no están en el ERP` : ""}.`);
  console.log(dryRun ? "\nDry-run finalizado. Nada se guardó." : "\nImportación completa.");
}

main();
