require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../src/db/database");
const { parseCsv, headerIndex, valorFila } = require("../src/utils/csv");

/*
 * Importa los clientes y productos de Lubritotal (convertidos desde el
 * sistema viejo) a la base del ERP.
 *
 * Uso:
 *   node scripts/importar-lubritotal.js <empresaNombreOId> [--dry-run]
 *
 * - empresaNombreOId: nombre exacto/parcial o id de la empresa destino.
 *   Si se omite, usa la variable IMPORT_EMPRESA o "Lubritotal".
 * - --dry-run: valida y muestra el resumen SIN escribir en la base.
 *
 * Es idempotente: no duplica productos por código ni clientes por documento.
 */

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const EMPRESA_BUSCADA = args[0] || process.env.IMPORT_EMPRESA || "Lubritotal";
const DIR = path.join(__dirname, "../data/importacion");

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

function importarProductos(empresaId) {
  const file = path.join(DIR, "productos.csv");
  if (!fs.existsSync(file)) return { creados: 0, existentes: 0, errores: 0, aviso: `No existe ${file}` };
  const filas = parseCsv(fs.readFileSync(file, "utf8"));
  const h = filas[0];
  const iCod = headerIndex(h, "codigo");
  const iBarra = headerIndex(h, "codigobarra", "barras");
  const iDesc = headerIndex(h, "descripcion", "nombre", "producto");
  const iPrecio = headerIndex(h, "precio");
  const iCosto = headerIndex(h, "costo");
  const iIva = headerIndex(h, "iva");
  const iUnidad = headerIndex(h, "unidad");

  const existe = db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?");
  const insert = db.prepare(
    "INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,costo,unidad,activo) VALUES(?,?,?,?,?,?,?,?,1)",
  );
  let creados = 0, existentes = 0, errores = 0;
  const enArchivo = new Set();
  const tx = db.transaction(() => {
    for (const f of filas.slice(1)) {
      const codigo = valorFila(f, h, iCod);
      const descripcion = valorFila(f, h, iDesc);
      if (!codigo || !descripcion) { errores++; continue; }
      const key = codigo.toLowerCase();
      if (enArchivo.has(key) || existe.get(empresaId, codigo)) { existentes++; continue; }
      enArchivo.add(key);
      const precio = Number(String(valorFila(f, h, iPrecio)).replace(",", ".")) || 0;
      const costo = Number(String(valorFila(f, h, iCosto)).replace(",", ".")) || 0;
      const iva = Number(String(valorFila(f, h, iIva)).replace(",", ".")) || 21;
      if (!dryRun) {
        insert.run(empresaId, codigo, valorFila(f, h, iBarra) || null, descripcion, precio, iva, costo, valorFila(f, h, iUnidad) || "UN");
      }
      creados++;
    }
  });
  tx();
  return { creados, existentes, errores };
}

function importarClientes(empresaId) {
  const file = path.join(DIR, "clientes.csv");
  if (!fs.existsSync(file)) return { creados: 0, existentes: 0, errores: 0, aviso: `No existe ${file}` };
  const filas = parseCsv(fs.readFileSync(file, "utf8"));
  const h = filas[0];
  const iNombre = headerIndex(h, "nombre", "razonsocial", "razon", "cliente");
  const iCuit = headerIndex(h, "cuit");
  const iDni = headerIndex(h, "dni", "documento");
  const iCond = headerIndex(h, "condicioniva", "condicion");
  const iDom = headerIndex(h, "domicilio", "direccion");
  const iLoc = headerIndex(h, "localidad");
  const iProv = headerIndex(h, "provincia");
  const iMail = headerIndex(h, "email", "correo");
  const iTel = headerIndex(h, "telefono", "tel");
  const iDesc = headerIndex(h, "descuento");

  const existe = db.prepare(
    "SELECT id FROM clientes WHERE empresa_id=? AND ((cuit IS NOT NULL AND cuit<>'' AND cuit=?) OR (dni IS NOT NULL AND dni<>'' AND dni=?))",
  );
  const insert = db.prepare(
    "INSERT INTO clientes(empresa_id,razon_social,cuit,dni,condicion_iva,domicilio,localidad,provincia,email,telefono,descuento_porcentaje) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  );
  let creados = 0, existentes = 0, errores = 0;
  const enArchivo = new Set();
  const tx = db.transaction(() => {
    for (const f of filas.slice(1)) {
      const nombre = valorFila(f, h, iNombre);
      if (!nombre) { errores++; continue; }
      const cuit = valorFila(f, h, iCuit);
      const dni = valorFila(f, h, iDni);
      const key = (cuit || dni || "").toLowerCase();
      if (key && (enArchivo.has(key) || existe.get(empresaId, cuit || "", dni || ""))) { existentes++; continue; }
      if (key) enArchivo.add(key);
      if (!dryRun) {
        insert.run(
          empresaId, nombre, cuit || null, dni || null,
          valorFila(f, h, iCond) || "CONSUMIDOR FINAL",
          valorFila(f, h, iDom) || null, valorFila(f, h, iLoc) || null, valorFila(f, h, iProv) || null,
          valorFila(f, h, iMail) || null, valorFila(f, h, iTel) || null,
          Math.max(0, Math.min(100, Number(valorFila(f, h, iDesc)) || 0)),
        );
      }
      creados++;
    }
  });
  tx();
  return { creados, existentes, errores };
}

function main() {
  const empresa = buscarEmpresa(EMPRESA_BUSCADA);
  if (!empresa) {
    console.error(`No encontré la empresa "${EMPRESA_BUSCADA}". Creala primero en el panel de superadmin.`);
    process.exit(1);
  }
  console.log(`Empresa destino: ${empresa.nombre} (id ${empresa.id})${dryRun ? "  [DRY-RUN: no se escribe nada]" : ""}`);
  console.log("Importando productos…");
  const p = importarProductos(empresa.id);
  console.log(`  productos: ${p.creados} creados, ${p.existentes} ya existían, ${p.errores} con error`, p.aviso || "");
  console.log("Importando clientes…");
  const c = importarClientes(empresa.id);
  console.log(`  clientes: ${c.creados} creados, ${c.existentes} ya existían, ${c.errores} con error`, c.aviso || "");
  console.log(dryRun ? "\nDry-run finalizado. Nada se guardó." : "\nImportación completa.");
}

main();
