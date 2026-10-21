const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const testDb = path.join(__dirname, "../data/vendedor-movil-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const controller = require("../src/controllers/vendedorMovil.controller");
const vendedorAuth = require("../src/middleware/vendedorAuth.middleware");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const empresa = db.prepare("SELECT * FROM empresas WHERE id=1").get();
const usuario = db.prepare("SELECT * FROM usuarios WHERE id=1").get();
const producto = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const cliente = db.prepare("SELECT * FROM clientes WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
assert(empresa && usuario && producto && cliente, "El seed demo no tiene datos suficientes.");

db.prepare("UPDATE vendedores SET usuario_id=? WHERE empresa_id=? AND id=1").run(usuario.id, empresa.id);
db.prepare(
  "INSERT OR IGNORE INTO vendedor_clientes(empresa_id,vendedor_id,cliente_id,activo) VALUES(?,?,?,1)",
).run(empresa.id, 1, cliente.id);
const vendedor = db.prepare("SELECT * FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1").get(empresa.id, usuario.id);
assert(vendedor, "No se pudo vincular el usuario al vendedor.");

const codigo = "12345678";
const expira = new Date(Date.now() + 86400000).toISOString();
db.prepare(
  "INSERT INTO vendedor_codigos(empresa_id,usuario_id,codigo_hash,creado_en,expira_en) VALUES(?,?,?,?,?)",
).run(empresa.id, usuario.id, crypto.createHash("sha256").update(codigo).digest("hex"), new Date().toISOString(), expira);

function respuesta(fn, req) {
  let status = 200;
  let payload = null;
  const res = {
    status(v) { status = v; return this; },
    json(v) { payload = v; return v; },
    cookie() { return this; },
    clearCookie() { return this; },
  };
  fn(req, res);
  return { status, payload };
}

const acceso = respuesta(controller.acceso, { ip: "127.0.0.1", body: { codigo } });
assert(acceso.status === 200 && acceso.payload?.token, `No se pudo canjear el código: ${JSON.stringify(acceso.payload)}`);
const segundo = respuesta(controller.acceso, { ip: "127.0.0.1", body: { codigo } });
assert(segundo.status === 401, "El código se pudo reutilizar.");

const reqBase = {
  body: {},
  params: {},
  query: {},
  empresa: { id: empresa.id, nombre: empresa.nombre },
  usuario: { id: usuario.id, nombre: usuario.nombre },
  vendedor,
};

const bootstrapResp = respuesta(controller.bootstrap, reqBase);
assert(bootstrapResp.status === 200, "No se pudo obtener el bootstrap.");
assert(bootstrapResp.payload.productos.length > 0, "El bootstrap no trae productos.");
assert(bootstrapResp.payload.clientes.some((c) => Number(c.id) === Number(cliente.id)), "La cartera no trae el cliente asignado.");

const crear = respuesta(controller.crearPresupuesto, {
  ...reqBase,
  body: {
    cliente_id: cliente.id,
    observaciones: "Presupuesto de prueba",
    items: [{ producto_id: producto.id, cantidad: 2 }],
  },
});
assert(crear.status === 201 && crear.payload?.documento?.id, `No se creó el presupuesto: ${JSON.stringify(crear.payload)}`);
const documento = crear.payload.documento;
assert(documento.tipo === "PRESUPUESTO", "El documento no es un presupuesto.");
assert(Number(documento.vendedor_id) === Number(vendedor.id), "El presupuesto no quedó asociado al vendedor.");
const esperado = Number(producto.precio) * 2;
assert(Math.abs(Number(documento.importe_total) - esperado) < 0.06, `Total inesperado: ${documento.importe_total} vs ${esperado}`);

const lista = respuesta(controller.listarPresupuestos, reqBase);
assert(lista.status === 200 && lista.payload.presupuestos.length === 1, "El presupuesto no aparece en el historial.");
const detalle = respuesta(controller.detallePresupuesto, { ...reqBase, params: { id: String(documento.id) } });
assert(detalle.status === 200 && detalle.payload.documento.items.length === 1, "El detalle del presupuesto no trae ítems.");

let authOk = false;
vendedorAuth(
  { get: (k) => (k.toLowerCase() === "authorization" ? `Bearer ${acceso.payload.token}` : "") },
  { status() { return this; }, json() { return this; } },
  () => { authOk = true; },
);
assert(authOk, "El token emitido no pasa por el middleware de vendedor.");

console.log("OK vendedor ERP: código de un solo uso, token, bootstrap, presupuesto, historial y autenticación.");
