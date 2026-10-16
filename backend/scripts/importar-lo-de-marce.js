require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../src/db/database");
const { parseCsv, headerIndex, valorFila } = require("../src/utils/csv");

/*
 * Da de alta la empresa LO DE MARCE CARNES en la base del ERP y le carga
 * los productos convertidos del sistema viejo (scripts/convertir-lo-de-marce.js).
 *
 * Crea/completa:
 *   - empresa (CUIT 20318111155, Monotributo, Neuquen 137, producción)
 *   - sucursal Casa Central, depósito principal y caja 1
 *   - punto de venta 2 (el que está dado de alta en AFIP)
 *   - usuario administrador (email y clave por parámetro)
 *   - rubros y ~3.8k productos desde data/importacion/lodemarce/productos.csv
 *
 * Uso en producción:
 *   docker exec afip-conversacional-erp node scripts/importar-lo-de-marce.js --admin-pass="Clave"
 *
 * Opciones:
 *   --dir=data/importacion/lodemarce   carpeta con los CSV convertidos
 *   --pv=2                             número de punto de venta
 *   --admin-email=... --admin-pass=... credenciales del administrador
 *   --dry-run                          valida y muestra el resumen sin escribir nada
 *
 * Es idempotente: si la empresa ya existe la completa, y no duplica
 * productos por código ni códigos de barras.
 */

function arg(name, def) {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  return found ? found.slice(pref.length) : def;
}
const dryRun = process.argv.includes("--dry-run");
const DIR = path.resolve(__dirname, "..", arg("dir", "data/importacion/lodemarce"));
const PV = Number(arg("pv", "2")) || 2;
const ADMIN_EMAIL = arg("admin-email", "marce@pixesistemas.com.ar");
const ADMIN_PASS = arg("admin-pass", process.env.MARCE_ADMIN_PASS || "");

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
  email: ADMIN_EMAIL,
};

function log(m) {
  console.log(`[marce] ${m}`);
}

const guardar = (fn) => (dryRun ? null : fn());

/* ---------------------------- empresa ----------------------------- */

let empresa =
  db.prepare("SELECT * FROM empresas WHERE cuit=?").get(EMPRESA.cuit) ||
  db.prepare("SELECT * FROM empresas WHERE nombre = ? COLLATE NOCASE").get(EMPRESA.nombre);

if (!empresa) {
  if (dryRun) {
    const csv = path.join(DIR, "productos.csv");
    const lineas = fs.existsSync(csv) ? parseCsv(fs.readFileSync(csv, "utf8")).length - 1 : 0;
    console.log(`[marce] DRY-RUN: se crearía la empresa ${EMPRESA.nombre} (CUIT ${EMPRESA.cuit}) con punto de venta ${PV}.`);
    console.log(`[marce] DRY-RUN: se importarían ${lineas} productos desde ${csv}.`);
    console.log("[marce] DRY-RUN: no se escribe nada en la base.");
    process.exit(0);
  }
  const apiKey = crypto.randomBytes(24).toString("hex");
  const info = db
    .prepare(
      `INSERT INTO empresas(
        nombre, cuit, condicion_iva, punto_venta, production, cert_path, key_path, cache_path,
        activa, razon_social, nombre_fantasia, direccion, localidad, provincia, telefono, email,
        ingresos_brutos, api_key, api_key_activa, tema
      ) VALUES(?,?,?,?,1,'','',?,1,?,?,?,?,?,?,?,?,?,1,'lavanda')`,
    )
    .run(
      EMPRESA.nombre,
      EMPRESA.cuit,
      EMPRESA.condicionIva,
      PV,
      `storage/private/fiscal/cache/LoDeMarce`,
      EMPRESA.razonSocial,
      EMPRESA.nombre,
      EMPRESA.direccion,
      EMPRESA.localidad,
      EMPRESA.provincia,
      EMPRESA.telefono,
      EMPRESA.email,
      EMPRESA.ingresosBrutos,
      apiKey,
    );
  empresa = db.prepare("SELECT * FROM empresas WHERE id=?").get(info.lastInsertRowid);
  log(`empresa ${empresa.nombre} creada (id ${empresa.id}, CUIT ${EMPRESA.cuit}, ${EMPRESA.condicionIva})`);
} else {
  log(`empresa ${empresa.nombre} ya existe (id ${empresa.id})`);
}
const e = empresa.id;

if (Number(empresa.punto_venta) !== PV) {
  guardar(() => db.prepare("UPDATE empresas SET punto_venta=? WHERE id=?").run(PV, e));
  log(`punto de venta por defecto de la empresa: ${PV}`);
}

/* ----------------------- sucursal / depósito ---------------------- */

let sucursal = db.prepare("SELECT * FROM sucursales WHERE empresa_id=? AND codigo='CASA'").get(e);
if (!sucursal) {
  const info = guardar(() =>
    db
      .prepare("INSERT INTO sucursales(empresa_id,codigo,nombre,domicilio,activo) VALUES(?,?,?,?,1)")
      .run(e, "CASA", "Casa Central", `${EMPRESA.direccion}, ${EMPRESA.localidad}`),
  );
  sucursal = { id: info ? Number(info.lastInsertRowid) : 0 };
  log("sucursal Casa Central creada");
}

let deposito = db.prepare("SELECT * FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1").get(e);
if (!deposito) {
  const info = guardar(() => db.prepare("INSERT INTO depositos(empresa_id,nombre,activo) VALUES(?,'Depósito Principal',1)").run(e));
  deposito = { id: info ? Number(info.lastInsertRowid) : 0 };
  log("depósito principal creado");
}

let cajero = db.prepare("SELECT * FROM cajeros WHERE empresa_id=? AND codigo='CAJA1'").get(e);
if (!cajero) {
  guardar(() => db.prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,activo) VALUES(?,'CAJA1','Caja 1',1)").run(e));
  log("caja 1 creada");
}

/* -------------------------- punto de venta ------------------------ */

let pv = db.prepare("SELECT * FROM puntos_venta WHERE empresa_id=? AND numero=?").get(e, PV);
if (!pv) {
  const info = guardar(() =>
    db
      .prepare(
        `INSERT INTO puntos_venta(empresa_id,sucursal_id,numero,nombre,nombre_fantasia,direccion,telefono,email,fiscal,activo)
         VALUES(?,?,?,?,?,?,?,?,1,1)`,
      )
      .run(e, sucursal.id, PV, "Casa Central", EMPRESA.nombre, EMPRESA.direccion, EMPRESA.telefono, EMPRESA.email),
  );
  pv = { id: info ? Number(info.lastInsertRowid) : 0, numero: PV };
  log(`punto de venta ${PV} creado (fiscal)`);
} else {
  log(`punto de venta ${PV} ya existe (id ${pv.id})`);
}

/* --------------------------- usuario admin ------------------------ */

let usuario = db.prepare("SELECT * FROM usuarios WHERE email=?").get(ADMIN_EMAIL);
if (!usuario) {
  if (!ADMIN_PASS && !dryRun) {
    console.error(`[marce] Falta --admin-pass="..." para crear el usuario ${ADMIN_EMAIL}.`);
    process.exit(1);
  }
  const info = guardar(() =>
    db
      .prepare("INSERT INTO usuarios(nombre,email,telefono,password_hash,activo) VALUES(?,?,?,?,1)")
      .run("Administrador", ADMIN_EMAIL, EMPRESA.telefono, bcrypt.hashSync(ADMIN_PASS, 10)),
  );
  usuario = { id: info ? Number(info.lastInsertRowid) : 0 };
  log(`usuario administrador ${ADMIN_EMAIL} creado`);
} else {
  if (ADMIN_PASS) {
    guardar(() => db.prepare("UPDATE usuarios SET password_hash=?,activo=1 WHERE id=?").run(bcrypt.hashSync(ADMIN_PASS, 10), usuario.id));
    log(`usuario ${ADMIN_EMAIL} actualizado (clave y activo)`);
  } else {
    log(`usuario ${ADMIN_EMAIL} ya existe (se mantiene la clave actual)`);
  }
}

if (!dryRun) {
  db.prepare(
    `INSERT INTO usuario_empresas(usuario_id,empresa_id,activo) VALUES(?,?,1)
     ON CONFLICT(usuario_id,empresa_id) DO UPDATE SET activo=1`,
  ).run(usuario.id, e);

  const rol = db.prepare("SELECT id FROM roles WHERE nombre='ADMIN'").get();
  if (!rol) throw new Error("No existe el rol ADMIN en esta instalación.");
  const tieneRol = db.prepare("SELECT id FROM usuario_roles WHERE usuario_id=? AND empresa_id=? AND rol_id=?").get(usuario.id, e, rol.id);
  if (!tieneRol) db.prepare("INSERT INTO usuario_roles(usuario_id,empresa_id,rol_id) VALUES(?,?,?)").run(usuario.id, e, rol.id);

  db.prepare(
    `INSERT OR IGNORE INTO usuario_puntos_venta(empresa_id,usuario_id,punto_venta_id,predeterminado) VALUES(?,?,?,1)`,
  ).run(e, usuario.id, pv.id);
  log(`usuario asignado a la empresa con rol ADMIN y al punto de venta ${PV}`);
}

/* ---------------------------- productos --------------------------- */

const file = path.join(DIR, "productos.csv");
if (!fs.existsSync(file)) {
  console.error(`[marce] No existe ${file}. Generá los CSV con scripts/convertir-lo-de-marce.js.`);
  process.exit(1);
}
const filas = parseCsv(fs.readFileSync(file, "utf8"));
const h = filas[0];
const iCod = headerIndex(h, "codigo");
const iBarra = headerIndex(h, "codigobarra", "barras", "ean");
const iDesc = headerIndex(h, "descripcion", "nombre", "producto");
const iPrecio = headerIndex(h, "precio");
const iIva = headerIndex(h, "iva");
const iCosto = headerIndex(h, "costo");
const iUnidad = headerIndex(h, "unidad");
const iRubro = headerIndex(h, "rubro");
if (iCod < 0 || iDesc < 0) throw new Error("El CSV de productos debe tener columnas codigo y descripcion.");

const rubroCache = new Map();
let rubrosNuevos = 0;
function rubroIdDe(nombre) {
  const limpio = String(nombre || "").trim();
  if (!limpio) return null;
  const key = limpio.toUpperCase();
  if (rubroCache.has(key)) return rubroCache.get(key);
  let row = db.prepare("SELECT id FROM rubros_productos WHERE empresa_id=? AND nombre=? COLLATE NOCASE").get(e, limpio);
  if (!row) {
    rubrosNuevos++;
    if (!dryRun) {
      row = { id: Number(db.prepare("INSERT INTO rubros_productos(empresa_id,nombre,activo) VALUES(?,?,1)").run(e, limpio).lastInsertRowid) };
    }
  }
  const id = row ? row.id : 0;
  rubroCache.set(key, id);
  return id;
}

const selCodigo = db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?");
const selBarra = db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo_barra=?");
const insertProducto = db.prepare(
  `INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,costo,unidad,rubro_id,activo,utilidad,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP)`,
);

let creados = 0, existentes = 0, errores = 0, sinBarra = 0;
const tx = db.transaction(() => {
  for (const f of filas.slice(1)) {
    const codigo = valorFila(f, h, iCod);
    const descripcion = valorFila(f, h, iDesc);
    if (!codigo || !descripcion) { errores++; continue; }
    if (selCodigo.get(e, codigo)) { existentes++; continue; }
    let barra = valorFila(f, h, iBarra) || null;
    if (barra && selBarra.get(e, barra)) { barra = null; sinBarra++; }

    const precio = Number(String(valorFila(f, h, iPrecio)).replace(",", ".")) || 0;
    const iva = Number(String(valorFila(f, h, iIva)).replace(",", ".")) || 0;
    const costo = Number(String(valorFila(f, h, iCosto)).replace(",", ".")) || 0;
    const unidad = valorFila(f, h, iUnidad) || "UN";
    const rubroId = rubroIdDe(valorFila(f, h, iRubro));
    const utilidad = costo > 0 && precio > 0 ? Math.round(((precio / (costo * (1 + iva / 100))) - 1) * 10000) / 100 : 0;

    if (!dryRun) {
      try {
        insertProducto.run(
          e, codigo, barra, descripcion,
          Math.round(precio * 100) / 100, iva, Math.round(costo * 100) / 100,
          unidad, rubroId, utilidad,
        );
      } catch (err) {
        errores++;
        continue;
      }
    }
    creados++;
  }
});
tx();

log(`productos: ${creados} ${dryRun ? "a importar" : "importados"}, ${existentes} ya existían, ${errores} con error`);
log(`rubros: ${rubrosNuevos} ${dryRun ? "a crear" : "creados"}`);
if (sinBarra) log(`códigos de barras liberados por estar repetidos en la base: ${sinBarra}`);

console.log("");
console.log("============ LO DE MARCE CARNES LISTA ============");
console.log(`Empresa : ${EMPRESA.nombre} (id ${e}) - CUIT ${EMPRESA.cuit} - ${EMPRESA.condicionIva}`);
console.log(`Punto de venta: ${PV}`);
console.log(`Admin   : ${ADMIN_EMAIL}${ADMIN_PASS ? " (clave aplicada)" : " (clave existente sin cambios)"}`);
console.log("");
console.log("Pendiente en superadmin: subir certificado y llave de AFIP del punto de venta 2");
console.log("(Datos fiscales → Certificado/Llave). El ambiente ya quedó en PRODUCCIÓN.");
console.log(dryRun ? "\nDry-run finalizado. Nada se guardó." : "\nImportación completa.");
