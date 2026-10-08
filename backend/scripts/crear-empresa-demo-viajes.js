require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../src/db/database");
const { nowLocal } = require("../src/utils/time");

/*
 * Crea (o completa) una empresa DEMO de VIAJES para mostrar a clientes:
 * agencia de turismo con paquetes, vuelos, hoteles, excursiones y seguros,
 * usuarios con nombre de usuario (login sin email), vendedores con cartera,
 * clientes con ubicación y pedidos/reservas de muestra.
 *
 * Uso en producción:
 *   docker exec afip-conversacional-erp node scripts/crear-empresa-demo-viajes.js
 */

const CLAVES = {
  admin: { usuario: "viajes", email: "demo@viajes.com", password: "viajes1234", nombre: "Administrador Viajes" },
  vendedor: { usuario: "agente", email: "agente@viajes.com", password: "agente1234", nombre: "Lucía Agente" },
};

const RUBROS = [
  { id: 920001, nombre: "Paquetes Nacionales" },
  { id: 920002, nombre: "Paquetes Internacionales" },
  { id: 920003, nombre: "Vuelos" },
  { id: 920004, nombre: "Hoteles" },
  { id: 920005, nombre: "Excursiones y Traslados" },
  { id: 920006, nombre: "Seguros y Asistencias" },
];

const PRODUCTOS = [
  ["PN01", "Paquete Bariloche 7 noches (2 pax)", 890000, 21, 920001],
  ["PN02", "Paquete Cataratas del Iguazú 4 noches (2 pax)", 520000, 21, 920001],
  ["PN03", "Paquete Salta y Jujuy 5 noches (2 pax)", 610000, 21, 920001],
  ["PN04", "Paquete Península Valdés 4 noches (2 pax)", 580000, 21, 920001],
  ["PI01", "Paquete Punta Cana 7 noches todo incluido (2 pax)", 2450000, 21, 920002],
  ["PI02", "Paquete Cancún 8 noches todo incluido (2 pax)", 3100000, 21, 920002],
  ["PI03", "Paquete Madrid y París 10 noches (2 pax)", 4200000, 21, 920002],
  ["PI04", "Paquete Disney Orlando 7 noches (2 pax)", 3890000, 21, 920002],
  ["VU01", "Vuelo ida y vuelta Buenos Aires - Miami", 1850000, 0, 920003],
  ["VU02", "Vuelo ida y vuelta Buenos Aires - Madrid", 2200000, 0, 920003],
  ["VU03", "Vuelo ida y vuelta Buenos Aires - Bariloche", 185000, 21, 920003],
  ["VU04", "Vuelo ida y vuelta Buenos Aires - Iguazú", 165000, 21, 920003],
  ["HO01", "Hotel boutique Bariloche - noche doble", 120000, 21, 920004],
  ["HO02", "Hotel 5 estrellas Cancún - noche doble todo incluido", 340000, 21, 920004],
  ["HO03", "Hotel céntrico Madrid - noche doble", 145000, 21, 920004],
  ["EX01", "Excursión Glaciar Perito Moreno", 95000, 21, 920005],
  ["EX02", "Excursión Isla Victoria y Bosque de Arrayanes", 78000, 21, 920005],
  ["EX03", "City tour Madrid con Museo del Prado", 65000, 21, 920005],
  ["EX04", "Nado con delfines en Punta Cana", 88000, 21, 920005],
  ["TR01", "Traslado privado aeropuerto - hotel", 35000, 21, 920005],
  ["AS01", "Seguro de viaje nacional 15 días", 28000, 21, 920006],
  ["AS02", "Seguro de viaje internacional 30 días", 75000, 21, 920006],
  ["AS03", "Asistencia al viajero Europa 30 días", 110000, 21, 920006],
];

const CLIENTES = [
  ["Familia Gómez", "Av. Santa Fe 2100", "CABA", -34.5955, -58.4005],
  ["Familia Martínez", "Av. Cabildo 1500", "CABA", -34.5723, -58.4562],
  ["Empresa Tech AR S.R.L. (incentivos)", "Av. Corrientes 1200", "CABA", -34.6034, -58.3855],
  ["Colegio San José (viaje de egresados)", "Av. Rivadavia 4800", "CABA", -34.6199, -58.4368],
  ["Sr. Ricardo Pérez", "Av. Belgrano 2200", "CABA", -34.6132, -58.4017],
  ["Sra. Laura Fernández", "Av. Callao 900", "CABA", -34.5992, -58.3927],
  ["Agencia Congresos BA", "Av. Córdoba 1300", "CABA", -34.5991, -58.3898],
  ["Familia Rodríguez", "Av. Directorio 1800", "CABA", -34.6223, -58.4436],
  ["Sr. Diego López", "Av. Entre Ríos 700", "CABA", -34.6155, -58.3918],
  ["Sra. Ana Torres", "Av. Federico Lacroze 2300", "CABA", -34.5806, -58.4474],
  ["Empresa Farma Plus (convención anual)", "Av. Leandro N. Alem 800", "CABA", -34.6000, -58.3700],
  ["Club Atlético Norte (delegación)", "Av. del Libertador 5600", "CABA", -34.5590, -58.4460],
];

function log(msg) {
  console.log(`[demo-viajes] ${msg}`);
}

const tieneColumnaUsuario = db
  .prepare("PRAGMA table_info(usuarios)")
  .all()
  .some((c) => c.name === "usuario");

/* ---------------------------- empresa ---------------------------- */

let empresa = db.prepare("SELECT * FROM empresas WHERE nombre='DEMO VIAJES'").get();

if (!empresa) {
  const apiKey = crypto.randomBytes(24).toString("hex");
  const info = db
    .prepare(
      `INSERT INTO empresas(
        nombre, cuit, condicion_iva, punto_venta, production, cert_path, key_path, cache_path,
        activa, razon_social, nombre_fantasia, direccion, localidad, provincia, telefono, email,
        api_key, api_key_activa, tema
      ) VALUES(?,?,?,1,0,?,?,?,1,?,?,?,?,?,?,?,?,1,'celeste')`,
    )
    .run(
      "DEMO VIAJES",
      "30999999998",
      "RESPONSABLE INSCRIPTO",
      "src/certificates/empresa1/cert.crt",
      "src/certificates/empresa1/private.key",
      "storage/private/fiscal/cache/DEMO VIAJES",
      "Viajes Demo S.R.L.",
      "DEMO VIAJES",
      "Av. Corrientes 1234, piso 5",
      "CABA",
      "Ciudad de Buenos Aires",
      "11 5555-0000",
      "demo@viajes.com",
      apiKey,
    );
  empresa = db.prepare("SELECT * FROM empresas WHERE id=?").get(info.lastInsertRowid);
  log(`empresa DEMO VIAJES creada (id ${empresa.id})`);
} else {
  log(`empresa DEMO VIAJES ya existe (id ${empresa.id})`);
}

const e = empresa.id;

/* ------------------------- módulos y roles ------------------------ */

for (const modulo of ["PREVENTA_MOVIL", "COMPRAS_MOVIL"]) {
  db.prepare(
    `INSERT INTO modulos_empresa(empresa_id,modulo,activo) VALUES(?,?,1)
     ON CONFLICT(empresa_id,modulo) DO UPDATE SET activo=1`,
  ).run(e, modulo);
}
log("módulos de pedidos móviles y compras activados");

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
    .run(e, "CASA", "Casa Central", "Av. Corrientes 1234 piso 5, CABA");
  sucursal = { id: Number(info.lastInsertRowid) };
  log("sucursal Casa Central creada");
}

let pv = db.prepare("SELECT * FROM puntos_venta WHERE empresa_id=? AND numero=1").get(e);
if (!pv) {
  const info = db
    .prepare(
      `INSERT INTO puntos_venta(empresa_id,sucursal_id,numero,nombre,nombre_fantasia,direccion,telefono,email,fiscal,activo,formato_impresion)
       VALUES(?,?,1,'Casa Central','DEMO VIAJES','Av. Corrientes 1234 piso 5','11 5555-0000','demo@viajes.com',0,1,'A4')`,
    )
    .run(e, sucursal.id);
  pv = { id: Number(info.lastInsertRowid), numero: 1 };
  log("punto de venta 1 creado");
}

let cajero = db.prepare("SELECT * FROM cajeros WHERE empresa_id=? AND codigo='CAJA1'").get(e);
if (!cajero) {
  const info = db
    .prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,activo) VALUES(?,?,?,1)")
    .run(e, "CAJA1", "Mostrador");
  cajero = { id: Number(info.lastInsertRowid) };
  log("caja Mostrador creada");
}

/* --------------------------- usuarios ----------------------------- */

function asegurarUsuario({ usuario, email, password, nombre }, rolNombre) {
  let row = db.prepare("SELECT * FROM usuarios WHERE email=?").get(email);
  if (!row && usuario && tieneColumnaUsuario) {
    row = db.prepare("SELECT * FROM usuarios WHERE usuario=?").get(usuario);
  }
  const hash = bcrypt.hashSync(password, 10);
  if (!row) {
    if (tieneColumnaUsuario) {
      const info = db
        .prepare("INSERT INTO usuarios(nombre,usuario,email,telefono,password_hash,activo) VALUES(?,?,?,?,?,1)")
        .run(nombre, usuario, email, "", hash);
      row = db.prepare("SELECT * FROM usuarios WHERE id=?").get(info.lastInsertRowid);
    } else {
      const info = db
        .prepare("INSERT INTO usuarios(nombre,email,telefono,password_hash,activo) VALUES(?,?,?,?,1)")
        .run(nombre, email, "", hash);
      row = db.prepare("SELECT * FROM usuarios WHERE id=?").get(info.lastInsertRowid);
    }
    log(`usuario ${usuario || email} creado`);
  } else {
    if (tieneColumnaUsuario) {
      db.prepare("UPDATE usuarios SET usuario=?, password_hash=?, activo=1 WHERE id=?").run(
        usuario,
        hash,
        row.id,
      );
    } else {
      db.prepare("UPDATE usuarios SET password_hash=?, activo=1 WHERE id=?").run(hash, row.id);
    }
    log(`usuario ${usuario || email} actualizado`);
  }

  db.prepare(
    `INSERT INTO usuario_empresas(usuario_id,empresa_id,activo) VALUES(?,?,1)
     ON CONFLICT(usuario_id,empresa_id) DO UPDATE SET activo=1`,
  ).run(row.id, e);

  const rol = rolId(rolNombre);
  const tiene = db
    .prepare("SELECT id FROM usuario_roles WHERE usuario_id=? AND empresa_id=? AND rol_id=?")
    .get(row.id, e, rol);
  if (!tiene) {
    db.prepare("INSERT INTO usuario_roles(usuario_id,empresa_id,rol_id) VALUES(?,?,?)").run(
      row.id,
      e,
      rol,
    );
  }
  return row;
}

const userAdmin = asegurarUsuario(CLAVES.admin, "ADMIN");
const userVendedor = asegurarUsuario(CLAVES.vendedor, "VENDEDOR");

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

const vendedor1 = asegurarVendedor("Lucía Agente", 4, userVendedor.id);
const vendedor2 = asegurarVendedor("Carlos Ventas", 3, null);

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
      .run(e, razon, "CONSUMIDOR FINAL", domicilio, localidad, "Ciudad de Buenos Aires", "", "", lat, lng);
    cliente = { id: Number(info.lastInsertRowid), razon_social: razon };
  }
  clientesCreados.push(cliente);
}
log(`clientes de viajes: ${clientesCreados.length}`);

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
    ).run(e, codigo, descripcion, precio, iva, "SRV", Math.round(precio * 0.72), rubroId);
    productosCreados++;
  }
}
log(`productos/servicios de viajes creados: ${productosCreados}`);

/* ------------------------ pedidos de muestra ---------------------- */

function crearPedidoDemo({ numero, cliente, vendedor, estadoPedido, items, observaciones }) {
  const existe = db
    .prepare("SELECT id FROM ventas_pos WHERE empresa_id=? AND punto_venta=1 AND tipo='NOTA_PEDIDO' AND numero=?")
    .get(e, numero);
  if (existe) return existe.id;

  let subtotal = 0;
  let ivaTotal = 0;
  const lineas = items.map(([codigo, cantidad]) => {
    const p = db
      .prepare("SELECT id,codigo,descripcion,precio,iva FROM productos WHERE empresa_id=? AND codigo=?")
      .get(e, codigo);
    const neto = Number(p.precio) * cantidad;
    const ivaLinea = Math.round(neto * (Number(p.iva) / 100) * 100) / 100;
    subtotal += neto;
    ivaTotal += ivaLinea;
    return { ...p, cantidad, neto, ivaLinea };
  });
  const iva = Math.round(ivaTotal * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  const fecha = nowLocal().slice(0, 10);

  const tx = db.transaction(() => {
    const doc = db
      .prepare(
        `INSERT INTO documentos_comerciales(empresa_id,cliente_id,vendedor_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,subtipo)
         VALUES(?,?,?,'NOTA_PEDIDO','BORRADOR',1,?,?,'CONTADO',?,?,?,?,?,0,0,'POS','X')`,
      )
      .run(e, cliente.id, vendedor.id, numero, fecha, observaciones || "Reserva de demostración", subtotal, iva, total, subtotal);

    const insDoc = db.prepare(
      `INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total,rubro_id)
       VALUES(?,?,?,?,?,?,?,0,?,?,?,?,NULL)`,
    );
    for (const l of lineas) {
      insDoc.run(doc.lastInsertRowid, l.id, l.codigo, l.descripcion, "SRV", l.cantidad, l.precio, l.iva, l.neto, l.ivaLinea, Math.round((l.neto + l.ivaLinea) * 100) / 100);
    }

    const sale = db
      .prepare(
        `INSERT INTO ventas_pos(empresa_id,cliente_id,vendedor_id,punto_venta,numero,tipo,estado,estado_pedido,fecha,condicion_pago,observaciones,subtotal,total,documento_id,formato_impresion)
         VALUES(?,?,?,1,?,'NOTA_PEDIDO','PENDIENTE',?,?,'CONTADO',?,?,?,?,'A4')`,
      )
      .run(e, cliente.id, vendedor.id, numero, estadoPedido, fecha, observaciones || "Reserva de demostración", subtotal, total, doc.lastInsertRowid);

    const insItem = db.prepare(
      `INSERT INTO venta_pos_items(venta_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,costo_unitario,subtotal,promocion,rubro_id)
       VALUES(?,?,?,?,?,?,?,0,?,0,?,0,NULL)`,
    );
    for (const l of lineas) insItem.run(sale.lastInsertRowid, l.id, l.codigo, l.descripcion, "SRV", l.cantidad, l.precio, l.iva, l.neto);

    db.prepare(
      `INSERT INTO pedido_estado_historial(empresa_id,venta_id,documento_id,estado,usuario_id,usuario_nombre,detalle,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    ).run(e, sale.lastInsertRowid, doc.lastInsertRowid, estadoPedido, userVendedor.id, vendedor.nombre, "Reserva de demostración", nowLocal());

    return Number(sale.lastInsertRowid);
  });

  return tx();
}

const pedido1 = crearPedidoDemo({
  numero: 910001,
  cliente: clientesCreados[0],
  vendedor: vendedor1,
  estadoPedido: "PENDIENTE",
  observaciones: "Bariloche para 4 personas en julio",
  items: [["PN01", 2], ["EX02", 2], ["AS01", 4]],
});
const pedido2 = crearPedidoDemo({
  numero: 910002,
  cliente: clientesCreados[2],
  vendedor: vendedor1,
  estadoPedido: "PENDIENTE",
  observaciones: "Incentivo para 6 empleados - Punta Cana",
  items: [["PI01", 3], ["VU01", 6], ["AS02", 6]],
});
const pedido3 = crearPedidoDemo({
  numero: 910003,
  cliente: clientesCreados[3],
  vendedor: vendedor2,
  estadoPedido: "CONFIRMADO",
  observaciones: "Viaje de egresados: seña recibida",
  items: [["PN02", 20], ["EX01", 20], ["AS01", 40]],
});
log(`pedidos/reservas de demo listos: ${pedido1}, ${pedido2}, ${pedido3}`);

/* ----------------------------- visitas ---------------------------- */

const insVisita = db.prepare(
  `INSERT INTO visitas(empresa_id,vendedor_id,cliente_id,fecha,hora,latitud,longitud,resultado,observaciones)
   SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(
     SELECT 1 FROM visitas WHERE empresa_id=? AND cliente_id=? AND fecha=?
   )`,
);
insVisita.run(e, vendedor1.id, clientesCreados[4].id, nowLocal().slice(0, 10), "10:15:00", -34.6132, -58.4017, "NO_COMPRO", "Pidió cotización para enero", e, clientesCreados[4].id, nowLocal().slice(0, 10));
insVisita.run(e, vendedor2.id, clientesCreados[5].id, nowLocal().slice(0, 10), "11:40:00", -34.5992, -58.3927, "REPROGRAMAR", "Vuelve con la familia la semana que viene", e, clientesCreados[5].id, nowLocal().slice(0, 10));
log("visitas de demo listas");

/* ----------------------------- resumen ---------------------------- */

console.log("");
console.log("=========== EMPRESA DEMO VIAJES LISTA ===========");
console.log("Entrá a https://erp.pixesistemas.com.ar con:");
console.log(`  ADMIN    : usuario "${CLAVES.admin.usuario}" (o ${CLAVES.admin.email}) / ${CLAVES.admin.password}`);
console.log(`  AGENTE   : usuario "${CLAVES.vendedor.usuario}" (o ${CLAVES.vendedor.email}) / ${CLAVES.vendedor.password}`);
console.log("");
console.log("Apps:");
console.log(`  https://vendedor.pixesistemas.com.ar (usuario "${CLAVES.vendedor.usuario}")`);
console.log("  https://compras.pixesistemas.com.ar");
console.log("");
console.log("Contiene: 12 clientes con ubicación, 23 productos/servicios de turismo");
console.log("(paquetes, vuelos, hoteles, excursiones y seguros), 2 vendedores con");
console.log("cartera, 3 pedidos/reservas (2 pendientes y 1 confirmado) y 2 visitas.");
console.log("=================================================");
