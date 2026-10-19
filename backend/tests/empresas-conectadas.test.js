const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/empresas-conectadas-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const sync = require("../src/services/syncEmpresas.service");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const origen = db.prepare("SELECT * FROM empresas WHERE id=1").get();
const infoDestino = db
  .prepare(
    "INSERT INTO empresas(nombre,cuit,condicion_iva,punto_venta,production,cert_path,key_path,cache_path,activa) VALUES(?,?,?,1,0,'','','',1)",
  )
  .run("empresa-conectada", "20999999999", "MONOTRIBUTO");
const destinoId = Number(infoDestino.lastInsertRowid);

function conectar(a, b) {
  db.prepare("INSERT INTO empresas_conectadas(empresa_id,conectada_id) VALUES(?,?)").run(a, b);
  db.prepare("INSERT INTO empresas_conectadas(empresa_id,conectada_id) VALUES(?,?)").run(b, a);
}

function guardarCatalogo(empresaId, lista) {
  db.prepare(
    `INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,'afip_catalogs_v34',?,CURRENT_TIMESTAMP)
     ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json`,
  ).run(empresaId, JSON.stringify(lista));
}

function catalogo(empresaId) {
  const row = db.prepare("SELECT valor_json FROM app_state WHERE empresa_id=? AND clave='afip_catalogs_v34'").get(empresaId);
  return JSON.parse(row?.valor_json || "[]");
}

conectar(origen.id, destinoId);
assert(sync.conectadasDe(origen.id).includes(destinoId), "La conexión simétrica no quedó registrada.");

const rubro = db
  .prepare("INSERT INTO rubros_productos(empresa_id,nombre,activo) VALUES(?,?,1)")
  .run(origen.id, "Bebidas Sync");
const rubroId = Number(rubro.lastInsertRowid);

guardarCatalogo(origen.id, [
  { id: 10, tipo: "RUBRO", nombre: "Bebidas Sync" },
  { id: 20, tipo: "MARCA", nombre: "Marca Sync" },
  { id: 30, tipo: "SUBRUBRO", nombre: "Subrubro Sync", rubroId: 10 },
]);

const producto = db
  .prepare(
    `INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,unidad,activo,costo,utilidad,rubro_id,subrubro_id,marca_id)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(origen.id, "SYNC-001", "7790000000011", "Producto sincronizado", 1500, 21, "UN", 1, 900, 30, rubroId, 30, 20);

sync.propagarProducto(origen.id, Number(producto.lastInsertRowid));
const copia = db.prepare("SELECT * FROM productos WHERE empresa_id=? AND codigo='SYNC-001'").get(destinoId);
assert(copia, "El producto no se replicó.");
assert(Number(copia.precio) === 1500, "El precio replicado no coincide.");
assert(copia.codigo_barra === "7790000000011", "El código de barras no se replicó.");
const rubroDestino = db.prepare("SELECT * FROM rubros_productos WHERE id=?").get(copia.rubro_id);
assert(rubroDestino?.empresa_id === destinoId && rubroDestino.nombre === "Bebidas Sync", "El rubro no se replicó correctamente.");
const catalogoDestino = catalogo(destinoId);
const marcaDestino = catalogoDestino.find((c) => c.tipo === "MARCA" && c.nombre === "Marca Sync");
const subDestino = catalogoDestino.find((c) => c.tipo === "SUBRUBRO" && c.nombre === "Subrubro Sync");
assert(marcaDestino, "La marca no se replicó.");
assert(subDestino, "El subrubro no se replicó.");
assert(Number(copia.marca_id) === Number(marcaDestino.id), "El producto no quedó asociado a la marca replicada.");
assert(Number(copia.subrubro_id) === Number(subDestino.id), "El producto no quedó asociado al subrubro replicado.");

db.prepare("UPDATE productos SET precio=1800 WHERE id=?").run(Number(producto.lastInsertRowid));
sync.propagarPrecios(origen.id, [Number(producto.lastInsertRowid)]);
assert(Number(db.prepare("SELECT precio FROM productos WHERE id=?").get(copia.id).precio) === 1800, "El cambio de precio no se replicó.");

db.prepare("UPDATE productos SET activo=0 WHERE id=?").run(Number(producto.lastInsertRowid));
sync.propagarProducto(origen.id, Number(producto.lastInsertRowid), "DELETE");
assert(Number(db.prepare("SELECT activo FROM productos WHERE id=?").get(copia.id).activo) === 0, "La baja no se replicó.");

const cliente = db
  .prepare(
    "INSERT INTO clientes(empresa_id,razon_social,cuit,condicion_iva,cliente_pedidos,descuento_porcentaje) VALUES(?,?,?,?,0,0)",
  )
  .run(origen.id, "Cliente Sync", "20111111112", "RESPONSABLE INSCRIPTO");
const clienteId = Number(cliente.lastInsertRowid);
sync.propagarCliente(origen.id, clienteId);
const clienteDestino = db.prepare("SELECT * FROM clientes WHERE empresa_id=? AND cuit=?").get(destinoId, "20111111112");
assert(clienteDestino, "El cliente no se replicó.");
db.prepare("UPDATE clientes SET razon_social='Cliente Sync Editado' WHERE id=?").run(clienteId);
sync.propagarCliente(origen.id, clienteId);
assert(
  db.prepare("SELECT razon_social FROM clientes WHERE id=?").get(clienteDestino.id).razon_social === "Cliente Sync Editado",
  "La edición del cliente no se replicó.",
);
sync.propagarCliente(origen.id, clienteId, "DELETE");
assert(!db.prepare("SELECT id FROM clientes WHERE id=?").get(clienteDestino.id), "La baja del cliente no se replicó.");

guardarCatalogo(origen.id, [
  { id: 10, tipo: "RUBRO", nombre: "Bebidas Sync" },
  { id: 20, tipo: "MARCA", nombre: "Marca Sync Renombrada" },
  { id: 30, tipo: "SUBRUBRO", nombre: "Subrubro Sync", rubroId: 10 },
  { id: 40, tipo: "RUBRO", nombre: "Nuevo Rubro" },
]);
sync.sincronizarCatalogos(origen.id, catalogo(origen.id));
const catalogoFinal = catalogo(destinoId);
assert(catalogoFinal.some((c) => c.tipo === "MARCA" && c.nombre === "Marca Sync Renombrada"), "El renombre de marca no se replicó.");
assert(catalogoFinal.some((c) => c.tipo === "RUBRO" && c.nombre === "Nuevo Rubro"), "El rubro nuevo del catálogo no se replicó.");

db.prepare("DELETE FROM empresas_conectadas WHERE (empresa_id=? AND conectada_id=?) OR (empresa_id=? AND conectada_id=?)").run(
  origen.id,
  destinoId,
  destinoId,
  origen.id,
);
assert(sync.conectadasDe(origen.id).length === 0, "La desconexión no eliminó el par.");
db.prepare("UPDATE productos SET precio=2000 WHERE id=?").run(Number(producto.lastInsertRowid));
sync.propagarPrecios(origen.id, [Number(producto.lastInsertRowid)]);
assert(Number(db.prepare("SELECT precio FROM productos WHERE id=?").get(copia.id).precio) === 1800, "Se propagó un cambio estando desconectadas.");

console.log("OK empresas conectadas: productos, precios, rubros, marcas, subrubros, clientes y desconexión.");
