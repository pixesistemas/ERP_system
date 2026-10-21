const crypto = require("crypto");
const db = require("../src/db/database");

function argumento(nombre, defecto = "") {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 && process.argv[indice + 1] ? process.argv[indice + 1] : defecto;
}

function hash(valor) {
  return crypto.createHash("sha256").update(String(valor || "")).digest("hex");
}

const credencial = argumento("usuario") || argumento("email");
const empresaArg = argumento("empresa");
const nombreEmpresa = argumento("nombre");
const dias = Math.max(1, Number(argumento("dias", "1")) || 1);

if (!credencial) {
  console.error('Uso: node scripts/crear-codigo-vendedor.js --usuario "vendedor1" [--empresa ID_o_NOMBRE]');
  process.exit(1);
}

const usuario = db
  .prepare(
    `SELECT * FROM usuarios
     WHERE activo=1 AND (LOWER(email)=LOWER(?) OR LOWER(COALESCE(usuario,''))=LOWER(?))`,
  )
  .get(credencial, credencial);

if (!usuario) {
  console.error(`No encontré un usuario activo con email/usuario "${credencial}".`);
  process.exit(1);
}

const empresas = db
  .prepare(
    `SELECT e.id,e.nombre FROM usuario_empresas ue
     JOIN empresas e ON e.id=ue.empresa_id
     WHERE ue.usuario_id=? AND ue.activo=1 AND e.activa=1
     ORDER BY e.nombre`,
  )
  .all(usuario.id);

if (!empresas.length) {
  console.error("El usuario no tiene empresas activas.");
  process.exit(1);
}

let empresa;
if (empresaArg) {
  empresa = empresas.find((e) => String(e.id) === String(empresaArg) || e.nombre === empresaArg);
  if (!empresa) {
    console.error("El usuario no pertenece a esa empresa.");
    process.exit(1);
  }
} else if (empresas.length === 1) {
  empresa = empresas[0];
} else {
  console.error("El usuario tiene varias empresas. Indicá --empresa con el ID o nombre:");
  for (const e of empresas) console.error(`  ${e.id} - ${e.nombre}`);
  process.exit(1);
}

const vendedor = db
  .prepare("SELECT id,nombre FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1")
  .get(empresa.id, usuario.id);

if (!vendedor) {
  console.error("El usuario no está vinculado a un vendedor activo. Asignalo desde Vendedores y comisiones.");
  process.exit(1);
}

const codigo = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
const expiraEn = new Date(Date.now() + dias * 86400000).toISOString();

db.prepare(
  "INSERT INTO vendedor_codigos(empresa_id,usuario_id,codigo_hash,creado_en,expira_en) VALUES(?,?,?,?,?)",
).run(empresa.id, usuario.id, hash(codigo), new Date().toISOString(), expiraEn);

console.log("");
console.log("Código de acceso para la app de vendedores");
console.log("------------------------------------------");
console.log(`Vendedor: ${vendedor.nombre}`);
console.log(`Usuario:  ${usuario.email || usuario.usuario || usuario.nombre}`);
console.log(`Empresa:  ${empresa.nombre}`);
console.log(`Código:   ${codigo}`);
console.log(`Vence:    ${new Date(expiraEn).toLocaleString("es-AR")}`);
console.log("");
console.log("Se usa una sola vez en el celular y deja la sesión iniciada.");
