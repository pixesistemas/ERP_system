const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/reset-empresa-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const superadmin = require("../src/controllers/superadmin.controller");

const empresa =
  db.prepare("SELECT * FROM empresas WHERE nombre IN ('empresa1','PixeSistemas') ORDER BY id LIMIT 1").get();
if (!empresa) throw new Error("No se encontró la empresa demo del seed.");

const cliente = db.prepare("SELECT id FROM clientes WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const proveedor = db.prepare("SELECT id FROM proveedores WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const sucursal = db.prepare("SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const cajero = db.prepare("SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const producto = db.prepare("SELECT id FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
if (!cliente || !proveedor || !sucursal || !cajero || !producto) throw new Error("El seed demo no tiene datos suficientes.");

/*
 * Escenario que antes dejaba comprobantes sin borrar:
 * ventas_pos -> documentos_comerciales -> facturas, con la cuenta
 * corriente apuntando a ambos y una reserva por monto asociada.
 */
const reservaId = db
  .prepare(
    "INSERT INTO reservas_monto(empresa_id,cliente_id,numero,fecha,importe_original,saldo) VALUES(?,?,?,?,?,?)",
  )
  .run(empresa.id, cliente.id, "R-RESET", "2026-10-16", 5000, 4000).lastInsertRowid;

const facturaId = db
  .prepare(
    "INSERT INTO facturas(empresa_id,punto_venta,tipo_comprobante,numero,importe_neto,importe_iva,importe_total) VALUES(?,?,?,?,?,?,?)",
  )
  .run(empresa.id, 1, 6, 990001, 1000, 210, 1210).lastInsertRowid;

const documentoId = db
  .prepare("INSERT INTO documentos_comerciales(empresa_id,cliente_id,tipo,estado,factura_id) VALUES(?,?,?,?,?)")
  .run(empresa.id, cliente.id, "FACTURA_B", "CONFIRMADO", facturaId).lastInsertRowid;

db.prepare("INSERT INTO documento_items(documento_id,descripcion,cantidad,precio_unitario) VALUES(?,?,?,?)").run(
  documentoId,
  "Ítem de prueba reset",
  1,
  1000,
);
db.prepare("INSERT INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo) VALUES(?,?,?,?)").run(
  empresa.id,
  documentoId,
  documentoId,
  "PRUEBA",
);

const ventaId = db
  .prepare(
    "INSERT INTO ventas_pos(empresa_id,sucursal_id,cajero_id,punto_venta,numero,tipo,total,documento_id,reserva_monto_id) VALUES(?,?,?,?,?,?,?,?,?)",
  )
  .run(empresa.id, sucursal.id, cajero.id, 1, 990001, "FACTURA_B", 1210, documentoId, reservaId).lastInsertRowid;

db.prepare(
  "INSERT INTO venta_pos_items(venta_id,producto_id,descripcion,cantidad,precio_unitario,subtotal) VALUES(?,?,?,?,?,?)",
).run(ventaId, producto.id, "Ítem de prueba reset", 1, 1000, 1000);
db.prepare("INSERT INTO venta_pos_pagos(venta_id,medio,importe) VALUES(?,?,?)").run(ventaId, "EFECTIVO", 1210);

db.prepare("INSERT INTO reserva_monto_consumos(reserva_id,importe,venta_id) VALUES(?,?,?)").run(reservaId, 1000, ventaId);

db.prepare(
  "INSERT INTO cliente_cc_movimientos(empresa_id,cliente_id,tipo,concepto,debe,haber,saldo,factura_id,documento_id) VALUES(?,?,?,?,?,?,?,?,?)",
).run(empresa.id, cliente.id, "DEBITO", "Venta de prueba reset", 1210, 0, 1210, facturaId, documentoId);

db.prepare("INSERT INTO links_pago(empresa_id,cliente_id,documento_id,proveedor,importe) VALUES(?,?,?,?,?)").run(
  empresa.id,
  cliente.id,
  documentoId,
  "MERCADOPAGO",
  1210,
);

db.prepare("INSERT INTO ordenes_pago(empresa_id,proveedor_id,numero,fecha,total) VALUES(?,?,?,?,?)").run(
  empresa.id,
  proveedor.id,
  990001,
  "2026-10-16",
  100,
);

db.prepare(
  "INSERT INTO compras(empresa_id,proveedor_nombre,mes_iva,anio_iva,tipo_comprobante,punto_venta,numero,fecha,total) VALUES(?,?,?,?,?,?,?,?,?)",
).run(empresa.id, "Proveedor de prueba reset", 10, 2026, "FACTURA_A", 1, "990001", "2026-10-16", 100);

/* Otra empresa que no debe verse afectada por el borrado. */
const otraEmpresaId = db
  .prepare(
    "INSERT INTO empresas(nombre,cuit,condicion_iva,punto_venta,production,cert_path,key_path,cache_path,activa) VALUES(?,?,?,1,0,'','','',1)",
  )
  .run("empresa-reset-otra", "20000000001", "MONOTRIBUTO").lastInsertRowid;
db.prepare("INSERT INTO productos(empresa_id,codigo,descripcion,precio,iva,unidad,activo) VALUES(?,?,?,?,?,?,1)").run(
  otraEmpresaId,
  "X1",
  "Producto de otra empresa",
  100,
  21,
  "UN",
);
db.prepare("INSERT INTO ventas_pos(empresa_id,punto_venta,numero,tipo,total) VALUES(?,?,?,?,?)").run(
  otraEmpresaId,
  1,
  1,
  "VENTA",
  100,
);

let status = 200;
let payload;
const req = {
  params: { id: String(empresa.id) },
  body: {
    confirmar: empresa.nombre,
    categorias: ["VENTAS", "CUENTA_CORRIENTE", "VISITAS_RUTAS", "STOCK", "PRODUCTOS", "RUBROS_MARCAS", "COMPRAS", "CLIENTES", "WHATSAPP"],
  },
};
const res = {
  status(v) {
    status = v;
    return this;
  },
  json(v) {
    payload = v;
    return v;
  },
};
superadmin.borrarDatosEmpresa(req, res, (e) => {
  throw e;
});

if (status !== 200 || !payload?.ok) throw new Error(`El borrado falló: ${JSON.stringify(payload)}`);
if ((payload.errores || []).length) throw new Error(`Quedaron errores de borrado: ${payload.errores.join(" | ")}`);

const tablasConEmpresa = [
  "ventas_pos",
  "documentos_comerciales",
  "documento_relaciones",
  "facturas",
  "cliente_cc_movimientos",
  "links_pago",
  "reservas_monto",
  "ordenes_pago",
  "compras",
  "productos",
  "producto_codigos_barras",
  "producto_proveedores",
  "stock_productos",
  "stock_movimientos",
  "stock_reservas",
  "clientes",
  "vendedor_clientes",
  "descuentos_cliente",
  "whatsapp_clientes",
  "rubros_productos",
];
for (const tabla of tablasConEmpresa) {
  const n = db.prepare(`SELECT COUNT(*) n FROM ${tabla} WHERE empresa_id=?`).get(empresa.id).n;
  if (n !== 0) throw new Error(`Quedaron ${n} filas sin borrar en ${tabla} (la empresa debía quedar vacía).`);
}

const sobrantes = [
  ["venta_pos_items", "venta_id", "ventas_pos"],
  ["venta_pos_pagos", "venta_id", "ventas_pos"],
  ["documento_items", "documento_id", "documentos_comerciales"],
  ["factura_items", "factura_id", "facturas"],
  ["reserva_monto_consumos", "reserva_id", "reservas_monto"],
];
for (const [tabla, columna, padre] of sobrantes) {
  const n = db
    .prepare(`SELECT COUNT(*) n FROM ${tabla} WHERE ${columna} IN (SELECT id FROM ${padre} WHERE empresa_id=?)`)
    .get(empresa.id).n;
  if (n !== 0) throw new Error(`Quedaron ${n} filas huérfanas en ${tabla}.`);
}

const productosOtra = db.prepare("SELECT COUNT(*) n FROM productos WHERE empresa_id=?").get(otraEmpresaId).n;
const ventasOtra = db.prepare("SELECT COUNT(*) n FROM ventas_pos WHERE empresa_id=?").get(otraEmpresaId).n;
if (productosOtra !== 1 || ventasOtra !== 1) throw new Error("El borrado tocó datos de otra empresa.");

console.log("reset-empresa: OK — comprobantes, ventas, cuenta corriente, compras y órdenes de pago eliminados; otra empresa intacta.");
