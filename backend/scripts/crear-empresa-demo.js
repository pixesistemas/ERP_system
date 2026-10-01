require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../src/db/database");
const { nowLocal } = require("../src/utils/time");

/*
 * Crea (o completa) una empresa DEMO lista para mostrar a clientes:
 * usuarios de los tres roles, vendedores, puntos de venta, caja,
 * clientes con ubicación y cartera, productos con rubros, pedidos en
 * distintos estados, visitas y una ruta de reparto.
 *
 * Uso en producción:
 *   docker exec afip-conversacional-erp node scripts/crear-empresa-demo.js
 */

const CLAVES = {
  admin: { email: "demo@pixesistemas.com.ar", password: "demo1234", nombre: "Administrador Demo" },
  vendedor: { email: "vendedor@demo.com", password: "vendedor1234", nombre: "Juan Demo" },
  repartidor: { email: "repartidor@demo.com", password: "repartidor1234", nombre: "Pedro Repartidor" },
};

const RUBROS = [
  { id: 910001, nombre: "Almacén" },
  { id: 910002, nombre: "Bebidas" },
  { id: 910003, nombre: "Limpieza" },
  { id: 910004, nombre: "Perfumería" },
];

const PRODUCTOS = [
  ["A001", "Yerba mate 1 kg", 4500, 21, 910001],
  ["A002", "Azúcar 1 kg", 1800, 21, 910001],
  ["A003", "Arroz 1 kg", 2200, 21, 910001],
  ["A004", "Fideos 500 g", 1500, 21, 910001],
  ["A005", "Aceite girasol 1,5 L", 5200, 21, 910001],
  ["A006", "Harina 000 1 kg", 1600, 21, 910001],
  ["A007", "Café molido 250 g", 6800, 21, 910001],
  ["A008", "Galletitas surtidas 300 g", 2400, 21, 910001],
  ["B001", "Gaseosa cola 2,25 L", 3800, 21, 910002],
  ["B002", "Agua mineral 2 L", 1500, 21, 910002],
  ["B003", "Cerveza lata 473 ml", 2600, 21, 910002],
  ["B004", "Jugo de naranja 1 L", 2900, 21, 910002],
  ["B005", "Vino tinto 750 ml", 5400, 21, 910002],
  ["B006", "Fernet 750 ml", 12500, 21, 910002],
  ["L001", "Detergente 750 ml", 2700, 21, 910003],
  ["L002", "Lavandina 1 L", 1400, 21, 910003],
  ["L003", "Jabón en polvo 800 g", 4900, 21, 910003],
  ["L004", "Suavizante 900 ml", 3600, 21, 910003],
  ["L005", "Limpiador pisos 900 ml", 2800, 21, 910003],
  ["L006", "Rollo de cocina x 3", 2100, 21, 910003],
  ["P001", "Shampoo 400 ml", 5900, 21, 910004],
  ["P002", "Jabón de tocador x 3", 2600, 21, 910004],
  ["P003", "Pasta dental 90 g", 2300, 21, 910004],
  ["P004", "Desodorante aerosol", 4700, 21, 910004],
  ["P005", "Papel higiénico x 4", 3900, 21, 910004],
  ["P006", "Toallas femeninas x 8", 3100, 21, 910004],
];

const CLIENTES = [
  ["Almacén Don Pedro", "Monseñor Rösch 489", "Concordia", -31.392, -58.017],
  ["Supermercado La Estrella", "Villaguay 2381", "Concordia", -31.386, -58.023],
  ["Kiosco El Sol", "Calle 58 y Dr. Saure", "Concordia", -31.401, -58.034],
  ["Panadería La Espiga", "Av. Ramírez 1450", "Concordia", -31.395, -58.028],
  ["Rotisería Doña Rosa", "Hipólito Yrigoyen 3414", "Concordia", -31.378, -58.012],
  ["Despensa Los Amigos", "Güemes 726", "Concordia", -31.389, -58.041],
  ["Minimercado Central", "La Rioja 321", "Concordia", -31.404, -58.019],
  ["Autoservicio Norte", "Pampa Soler 3851", "Concordia", -31.371, -58.007],
  ["Almacén San Cayetano", "Moulins 285", "Concordia", -31.398, -58.030],
  ["Kiosco Pequeño Mundo", "Caraburet y Las Palomas", "Concordia", -31.383, -58.045],
  ["Restaurante El Fogón", "Urquiza 1234", "Concordia", -31.396, -58.026],
  ["Verdulería Don Luis", "Entre Ríos 890", "Concordia", -31.391, -58.036],
];

function log(msg) {
  console.log(`[demo] ${msg}`);
}

/* ---------------------------- empresa ---------------------------- */

let empresa = db.prepare("SELECT * FROM empresas WHERE nombre='DEMO'").get();

if (!empresa) {
  const apiKey = crypto.randomBytes(24).toString("hex");
  const info = db
    .prepare(
      `INSERT INTO empresas(
        nombre, cuit, condicion_iva, punto_venta, production, cert_path, key_path, cache_path,
        activa, razon_social, nombre_fantasia, direccion, localidad, provincia, telefono, email,
        api_key, api_key_activa, tema
      ) VALUES(?,?,?,1,0,?,?,?,1,?,?,?,?,?,?,?,?,1,'lavanda')`,
    )
    .run(
      "DEMO",
      "30999999999",
      "RESPONSABLE INSCRIPTO",
      "src/certificates/empresa1/cert.crt",
      "src/certificates/empresa1/private.key",
      "storage/private/fiscal/cache/DEMO",
      "Empresa Demo S.A.",
      "DEMO",
      "Av. Siempre Abierta 123",
      "Concordia",
      "Entre Ríos",
      "345 4000000",
      "demo@pixesistemas.com.ar",
      apiKey,
    );
  empresa = db.prepare("SELECT * FROM empresas WHERE id=?").get(info.lastInsertRowid);
  log(`empresa DEMO creada (id ${empresa.id})`);
} else {
  log(`empresa DEMO ya existe (id ${empresa.id})`);
}

const e = empresa.id;

/* ------------------------- módulos y roles ------------------------ */

for (const modulo of ["PREVENTA_MOVIL", "COMPRAS_MOVIL"]) {
  db.prepare(
    `INSERT INTO modulos_empresa(empresa_id,modulo,activo) VALUES(?,?,1)
     ON CONFLICT(empresa_id,modulo) DO UPDATE SET activo=1`,
  ).run(e, modulo);
}
log("módulos de pedidos y compras activados");

function rolId(nombre) {
  const row = db.prepare("SELECT id FROM roles WHERE nombre=?").get(nombre);
  if (!row) throw new Error(`No existe el rol ${nombre}`);
  return row.id;
}

/* --------------------------- sucursal/PV -------------------------- */

let sucursal = db.prepare("SELECT * FROM sucursales WHERE empresa_id=? AND codigo='CASA'").get(e);
if (!sucursal) {
  const info = db
    .prepare("INSERT INTO sucursales(empresa_id,codigo,nombre,domicilio,activo) VALUES(?,?,?,?,1)")
    .run(e, "CASA", "Casa Central", "Av. Siempre Abierta 123, Concordia");
  sucursal = { id: Number(info.lastInsertRowid) };
  log("sucursal Casa Central creada");
}

let pv = db.prepare("SELECT * FROM puntos_venta WHERE empresa_id=? AND numero=1").get(e);
if (!pv) {
  const info = db
    .prepare(
      `INSERT INTO puntos_venta(empresa_id,sucursal_id,numero,nombre,nombre_fantasia,direccion,telefono,email,fiscal,activo,formato_impresion)
       VALUES(?,?,1,'Casa Central','DEMO','Av. Siempre Abierta 123','345 4000000','demo@pixesistemas.com.ar',0,1,'A4')`,
    )
    .run(e, sucursal.id);
  pv = { id: Number(info.lastInsertRowid), numero: 1 };
  log("punto de venta 1 creado");
}

let cajero = db.prepare("SELECT * FROM cajeros WHERE empresa_id=? AND codigo='CAJA1'").get(e);
if (!cajero) {
  const info = db
    .prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,activo) VALUES(?,?,?,1)")
    .run(e, "CAJA1", "Caja 1");
  cajero = { id: Number(info.lastInsertRowid) };
  log("caja 1 creada");
}

/* --------------------------- usuarios ----------------------------- */

function asegurarUsuario({ email, password, nombre }, rolNombre) {
  let usuario = db.prepare("SELECT * FROM usuarios WHERE email=?").get(email);
  if (!usuario) {
    const info = db
      .prepare("INSERT INTO usuarios(nombre,email,telefono,password_hash,activo) VALUES(?,?,?,?,1)")
      .run(nombre, email, "", bcrypt.hashSync(password, 10));
    usuario = db.prepare("SELECT * FROM usuarios WHERE id=?").get(info.lastInsertRowid);
    log(`usuario ${email} creado`);
  } else {
    db.prepare("UPDATE usuarios SET password_hash=?,activo=1 WHERE id=?").run(
      bcrypt.hashSync(password, 10),
      usuario.id,
    );
    log(`usuario ${email} actualizado`);
  }

  db.prepare(
    `INSERT INTO usuario_empresas(usuario_id,empresa_id,activo) VALUES(?,?,1)
     ON CONFLICT(usuario_id,empresa_id) DO UPDATE SET activo=1`,
  ).run(usuario.id, e);

  const rol = rolId(rolNombre);
  const tiene = db
    .prepare("SELECT id FROM usuario_roles WHERE usuario_id=? AND empresa_id=? AND rol_id=?")
    .get(usuario.id, e, rol);
  if (!tiene) {
    db.prepare("INSERT INTO usuario_roles(usuario_id,empresa_id,rol_id) VALUES(?,?,?)").run(
      usuario.id,
      e,
      rol,
    );
  }
  return usuario;
}

const userAdmin = asegurarUsuario(CLAVES.admin, "ADMIN");
const userVendedor = asegurarUsuario(CLAVES.vendedor, "VENDEDOR");
const userRepartidor = asegurarUsuario(CLAVES.repartidor, "REPARTIDOR");

/* --------------------------- vendedores --------------------------- */

function asegurarVendedor(nombre, comision, usuarioId) {
  let vendedor = db.prepare("SELECT * FROM vendedores WHERE empresa_id=? AND nombre=?").get(e, nombre);
  if (!vendedor) {
    const info = db
      .prepare(
        "INSERT INTO vendedores(empresa_id,nombre,telefono,email,comision_porcentaje,usuario_id,activo) VALUES(?,?,?,?,?,?,1)",
      )
      .run(e, nombre, "", "", comision, usuarioId || null);
    vendedor = db.prepare("SELECT * FROM vendedores WHERE id=?").get(info.lastInsertRowid);
    log(`vendedor ${nombre} creado`);
  } else if (usuarioId && Number(vendedor.usuario_id || 0) !== Number(usuarioId)) {
    db.prepare("UPDATE vendedores SET usuario_id=? WHERE id=?").run(usuarioId, vendedor.id);
    vendedor.usuario_id = usuarioId;
  }
  return vendedor;
}

const vendedor1 = asegurarVendedor("Juan Demo", 5, userVendedor.id);
const vendedor2 = asegurarVendedor("María Demo", 3, null);

/* ---------------------------- clientes ---------------------------- */

const clientesCreados = [];
for (const [razon, domicilio, localidad, lat, lng] of CLIENTES) {
  let cliente = db
    .prepare("SELECT * FROM clientes WHERE empresa_id=? AND razon_social=?")
    .get(e, razon);
  if (!cliente) {
    const info = db
      .prepare(
        `INSERT INTO clientes(empresa_id,razon_social,condicion_iva,domicilio,localidad,provincia,telefono,email,descuento_porcentaje,latitud,longitud,cliente_pedidos)
         VALUES(?,?,?,?,?,?,?,?,0,?,?,1)`,
      )
      .run(e, razon, "CONSUMIDOR FINAL", domicilio, localidad, "Entre Ríos", "", "", lat, lng);
    cliente = { id: Number(info.lastInsertRowid), razon_social: razon };
  }
  clientesCreados.push(cliente);
}
log(`clientes de demo: ${clientesCreados.length}`);

/* ---------------------------- cartera ----------------------------- */

const insCartera = db.prepare(
  `INSERT INTO vendedor_clientes(empresa_id,vendedor_id,cliente_id,activo) VALUES(?,?,?,1)
   ON CONFLICT(empresa_id,vendedor_id,cliente_id) DO UPDATE SET activo=1`,
);
clientesCreados.forEach((c, i) => {
  insCartera.run(e, i % 2 === 0 ? vendedor1.id : vendedor2.id, c.id);
});
log("cartera cargada para los dos vendedores");

/* ---------------------------- productos --------------------------- */

let catalogs = [];
try {
  const row = db.prepare("SELECT valor_json FROM app_state WHERE empresa_id=? AND clave='afip_catalogs_v34'").get(e);
  catalogs = JSON.parse(row?.valor_json || "[]");
} catch {
  catalogs = [];
}
for (const r of RUBROS) {
  if (!catalogs.some((c) => Number(c.id) === r.id)) {
    catalogs.push({ id: r.id, tipo: "RUBRO", nombre: r.nombre, rubroId: null });
  }
}
db.prepare(
  `INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json,updated_at=CURRENT_TIMESTAMP`,
).run(e, "afip_catalogs_v34", JSON.stringify(catalogs));

const insRubro = db.prepare(
  "INSERT OR IGNORE INTO rubros_productos(empresa_id,nombre) VALUES(?,?)",
);
for (const r of RUBROS) insRubro.run(e, r.nombre);

let productosCreados = 0;
for (const [codigo, descripcion, precio, iva, rubroId] of PRODUCTOS) {
  const existe = db
    .prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?")
    .get(e, codigo);
  if (!existe) {
    db.prepare(
      `INSERT INTO productos(empresa_id,codigo,descripcion,precio,iva,unidad,activo,costo,utilidad,rubro_id)
       VALUES(?,?,?,?,?,?,1,?,30,?)`,
    ).run(e, codigo, descripcion, precio, iva, "UN", Math.round(precio * 0.7), rubroId);
    productosCreados++;
  }
}
log(`productos de demo creados: ${productosCreados}`);

/* ------------------------ pedidos de muestra ---------------------- */

function productoId(codigo) {
  return db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?").get(e, codigo)?.id;
}

function crearPedidoDemo({ numero, cliente, vendedor, estadoPedido, items }) {
  const existe = db
    .prepare("SELECT id FROM ventas_pos WHERE empresa_id=? AND punto_venta=1 AND tipo='NOTA_PEDIDO' AND numero=?")
    .get(e, numero);
  if (existe) return existe.id;

  let subtotal = 0;
  const lineas = items.map(([codigo, cantidad]) => {
    const p = db.prepare("SELECT id,codigo,descripcion,precio,iva FROM productos WHERE empresa_id=? AND codigo=?").get(e, codigo);
    const neto = Number(p.precio) * cantidad;
    subtotal += neto;
    return { ...p, cantidad, neto };
  });
  const iva = Math.round(subtotal * 0.21 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  const fecha = nowLocal().slice(0, 10);

  const tx = db.transaction(() => {
    const doc = db
      .prepare(
        `INSERT INTO documentos_comerciales(empresa_id,cliente_id,vendedor_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,subtipo)
         VALUES(?,?,?,'NOTA_PEDIDO','BORRADOR',1,?,?,'CONTADO','Pedido de demostración',?,?,?,?,0,0,'POS','X')`,
      )
      .run(e, cliente.id, vendedor.id, numero, fecha, subtotal, iva, total, subtotal);

    const insDoc = db.prepare(
      `INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total,rubro_id)
       VALUES(?,?,?,?,?,?,?,0,?,?,?,?,NULL)`,
    );
    for (const l of lineas) {
      insDoc.run(doc.lastInsertRowid, l.id, l.codigo, l.descripcion, "UN", l.cantidad, l.precio, l.iva, l.neto, Math.round(l.neto * 0.21 * 100) / 100, Math.round(l.neto * 1.21 * 100) / 100);
    }

    const sale = db
      .prepare(
        `INSERT INTO ventas_pos(empresa_id,cliente_id,vendedor_id,punto_venta,numero,tipo,estado,estado_pedido,fecha,condicion_pago,observaciones,subtotal,total,documento_id,formato_impresion)
         VALUES(?,?,?,1,?,'NOTA_PEDIDO','PENDIENTE',?,?,'CONTADO','Pedido de demostración',?,?,?,'A4')`,
      )
      .run(e, cliente.id, vendedor.id, numero, estadoPedido, fecha, subtotal, total, doc.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO venta_pos_items(venta_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,costo_unitario,subtotal,promocion,rubro_id)
       VALUES(?,?,?,?,?,?,?,0,?,0,?,0,NULL)`,
    );
    for (const l of lineas) insItem.run(sale.lastInsertRowid, l.id, l.codigo, l.descripcion, "UN", l.cantidad, l.precio, l.iva, l.neto);

    db.prepare(
      `INSERT INTO pedido_estado_historial(empresa_id,venta_id,documento_id,estado,usuario_id,usuario_nombre,detalle,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    ).run(e, sale.lastInsertRowid, doc.lastInsertRowid, estadoPedido, userVendedor.id, vendedor.nombre, "Pedido de demostración", nowLocal());

    return Number(sale.lastInsertRowid);
  });

  return tx();
}

const pedido1 = crearPedidoDemo({
  numero: 900001,
  cliente: clientesCreados[0],
  vendedor: vendedor1,
  estadoPedido: "PENDIENTE",
  items: [["A001", 5], ["A002", 10], ["B001", 6]],
});
const pedido2 = crearPedidoDemo({
  numero: 900002,
  cliente: clientesCreados[2],
  vendedor: vendedor1,
  estadoPedido: "PENDIENTE",
  items: [["L001", 4], ["L002", 12], ["P001", 3]],
});
const pedido3 = crearPedidoDemo({
  numero: 900003,
  cliente: clientesCreados[1],
  vendedor: vendedor2,
  estadoPedido: "CONFIRMADO",
  items: [["B003", 24], ["B004", 12], ["A007", 6]],
});
log(`pedidos de demo listos: ${pedido1}, ${pedido2}, ${pedido3}`);

/* ----------------------------- visitas ---------------------------- */

const insVisita = db.prepare(
  `INSERT INTO visitas(empresa_id,vendedor_id,cliente_id,fecha,hora,latitud,longitud,resultado,observaciones)
   SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(
     SELECT 1 FROM visitas WHERE empresa_id=? AND cliente_id=? AND fecha=?
   )`,
);
insVisita.run(e, vendedor1.id, clientesCreados[3].id, nowLocal().slice(0, 10), "09:15:00", -31.395, -58.028, "NO_COMPRO", "Visitó, no necesitaba mercadería", e, clientesCreados[3].id, nowLocal().slice(0, 10));
insVisita.run(e, vendedor2.id, clientesCreados[4].id, nowLocal().slice(0, 10), "10:40:00", -31.378, -58.012, "REPROGRAMAR", "Pidió volver la semana que viene", e, clientesCreados[4].id, nowLocal().slice(0, 10));
log("visitas de demo listas");

/* ------------------------------ ruta ------------------------------ */

const rutaExiste = db
  .prepare("SELECT id FROM rutas_reparto WHERE empresa_id=? AND numero='R-900001'")
  .get(e);
if (!rutaExiste) {
  const tx = db.transaction(() => {
    const ruta = db
      .prepare(
        `INSERT INTO rutas_reparto(empresa_id,numero,fecha,repartidor_id,usuario_id,estado,observaciones)
         VALUES(?,'R-900001',?,?,?,'ARMADA','Ruta de demostración')`,
      )
      .run(e, nowLocal().slice(0, 10), userRepartidor.id, userAdmin.id);
    db.prepare("INSERT INTO ruta_pedidos(empresa_id,ruta_id,venta_id,orden) VALUES(?,?,?,1)").run(
      e,
      ruta.lastInsertRowid,
      pedido3,
    );
    db.prepare("UPDATE ventas_pos SET estado_pedido='PREPARANDO' WHERE id=?").run(pedido3);
    return ruta.lastInsertRowid;
  });
  tx();
  log("ruta de reparto de demo creada (asignada al usuario repartidor)");
}

/* ----------------------------- resumen ---------------------------- */

console.log("");
console.log("=============== EMPRESA DEMO LISTA ===============");
console.log("Entrá a https://erp.pixesistemas.com.ar con:");
console.log(`  ADMIN      : ${CLAVES.admin.email} / ${CLAVES.admin.password}`);
console.log(`  VENDEDOR   : ${CLAVES.vendedor.email} / ${CLAVES.vendedor.password}`);
console.log(`  REPARTIDOR : ${CLAVES.repartidor.email} / ${CLAVES.repartidor.password}`);
console.log("");
console.log("Apps:");
console.log("  https://vendedor.pixesistemas.com.ar   (vendedor@demo.com)");
console.log("  https://repartidor.pixesistemas.com.ar (repartidor@demo.com)");
console.log("  https://compras.pixesistemas.com.ar    (demo@pixesistemas.com.ar)");
console.log("");
console.log("Contiene: 12 clientes con ubicación, 26 productos con rubros,");
console.log("2 vendedores con cartera, 3 pedidos (2 pendientes y 1 confirmado),");
console.log("2 visitas y 1 ruta de reparto.");
console.log("==================================================");
