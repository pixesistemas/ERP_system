const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/vendedor-movil-test.db");
process.env.DB_PATH = testDb;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-vendedor";
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const controller = require("../src/controllers/vendedorMovil.controller");
const requireVendedor = require("../src/middleware/vendedorAuth.middleware");
const { revocarDispositivos } = require("../src/repositories/refreshToken.repository");

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

function ejecutar(fn, req) {
  let status = 200;
  let payload = null;
  const cookies = {};
  const res = {
    status(v) { status = v; return this; },
    json(v) { payload = v; return v; },
    cookie(nombre, valor) { cookies[nombre] = valor; return this; },
    clearCookie(nombre) { delete cookies[nombre]; return this; },
  };
  const resultado = fn(req, res);
  return { status, payload, cookies, resultado };
}

const loginMal = ejecutar(controller.login, {
  headers: {},
  body: { usuario: "admin@empresa.com", password: "incorrecta" },
});
assert(loginMal.status === 401, "Aceptó una contraseña incorrecta.");

const login = ejecutar(controller.login, {
  headers: {},
  body: { usuario: "admin@empresa.com", password: "admin123" },
});
assert(login.status === 200 && login.payload?.token, `No se pudo iniciar sesión: ${JSON.stringify(login.payload)}`);
const refreshToken = login.cookies["pixe_vendedor_refresh"];
assert(refreshToken, "No se guardó el refresh token en cookie.");
assert(login.payload.vendedor?.id === vendedor.id, "El login no devolvió el vendedor.");

const cookieHeader = `pixe_vendedor_refresh=${refreshToken}`;
const reqBase = {
  body: {},
  params: {},
  query: {},
  headers: { cookie: cookieHeader },
  empresa: { id: empresa.id, nombre: empresa.nombre },
  usuario: { id: usuario.id, nombre: usuario.nombre },
  vendedor,
};

let autorizado = false;
requireVendedor(reqBase, { status() { return this; }, json() { return this; } }, () => { autorizado = true; });
assert(autorizado, "El middleware de vendedor rechazó una sesión válida.");

const bootstrapResp = ejecutar(controller.bootstrap, reqBase);
assert(bootstrapResp.status === 200, "No se pudo obtener el bootstrap.");
assert(bootstrapResp.payload.productos.length > 0, "El bootstrap no trae productos.");
assert(bootstrapResp.payload.clientes.some((c) => Number(c.id) === Number(cliente.id)), "La cartera no trae el cliente asignado.");

const crear = ejecutar(controller.crearPresupuesto, {
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

const lista = ejecutar(controller.listarPresupuestos, reqBase);
assert(lista.status === 200 && lista.payload.presupuestos.length === 1, "El presupuesto no aparece en el historial.");
const detalle = ejecutar(controller.detallePresupuesto, { ...reqBase, params: { id: String(documento.id) } });
assert(detalle.status === 200 && detalle.payload.documento.items.length === 1, "El detalle del presupuesto no trae ítems.");

const ocasional = ejecutar(controller.crearPresupuesto, {
  ...reqBase,
  body: {
    cliente_nombre: "Cliente fuera de cartera",
    items: [
      { manual: true, descripcion: "Servicio de instalación", cantidad: 1, precio: 1000, iva: 21 },
    ],
  },
});
assert(ocasional.status === 201 && ocasional.payload?.documento?.id, `No se creó el presupuesto manual: ${JSON.stringify(ocasional.payload)}`);
const clienteCreado = db
  .prepare("SELECT id FROM clientes WHERE empresa_id=? AND razon_social=?")
  .get(empresa.id, "Cliente fuera de cartera");
assert(clienteCreado, "No se creó el cliente fuera de cartera.");
assert(Number(ocasional.payload.documento.cliente_id) === Number(clienteCreado.id), "El presupuesto manual no quedó asociado al cliente nuevo.");
assert(Math.abs(Number(ocasional.payload.documento.importe_total) - 1000) < 0.02, "El total del artículo manual es incorrecto.");
const detalleOcasional = ejecutar(controller.detallePresupuesto, { ...reqBase, params: { id: String(ocasional.payload.documento.id) } });
assert(
  detalleOcasional.payload.documento.items.some((i) => i.descripcion === "Servicio de instalación" && i.producto_id == null),
  "El presupuesto manual no guardó el artículo de servicio.",
);

const refresco = ejecutar(controller.refresh, { headers: { cookie: cookieHeader } });
assert(refresco.status === 200 && refresco.payload?.token, "No se pudo refrescar la sesión.");

revocarDispositivos(usuario.id);
const revocado = ejecutar(controller.refresh, { headers: { cookie: cookieHeader } });
assert(revocado.status === 401, "La sesión revocada todavía se puede refrescar.");
let rechazado = false;
requireVendedor(reqBase, { status() { return this; }, json() { return this; } }, () => { rechazado = true; });
assert(!rechazado, "El middleware aceptó una sesión revocada.");

console.log("OK vendedor ERP: login, refresh token persistente, revocación por administrador, precios, cliente fuera de cartera, artículo manual e historial.");
