const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/recepcion-mercaderia-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const service = require("../src/services/recepcion.service");
const ocr = require("../src/services/ocrRecepcion.service");
const { getPermisosUsuario } = require("../src/repositories/security.repository");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function errorEsperado(fn, statusCode, texto) {
  try {
    fn();
  } catch (error) {
    assert(error.statusCode === statusCode, `Esperaba HTTP ${statusCode}, recibí ${error.statusCode}: ${error.message}`);
    if (texto) assert(error.message.includes(texto), `Mensaje inesperado: ${error.message}`);
    return error;
  }
  throw new Error(`Esperaba un error ${statusCode} y no ocurrió.`);
}

const empresa = db.prepare("SELECT * FROM empresas WHERE id=1").get();
const usuario = db.prepare("SELECT * FROM usuarios WHERE email='admin@empresa.com'").get();
const deposito = db.prepare("SELECT * FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const productoA = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const productoB = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1 OFFSET 1").get(empresa.id);
const permisos = getPermisosUsuario({ usuarioId: usuario.id, empresaId: empresa.id });
assert(empresa && usuario && deposito && productoA && productoB, "El seed demo no tiene datos suficientes.");
for (const permiso of ["recepcion.gestionar", "recepcion.confirmar", "compras.gestionar", "productos.costos", "productos.precios"]) {
  assert(permisos.includes(permiso), `El rol ADMIN no recibió ${permiso}.`);
}

const numero = `T-${Date.now()}`;
const inicial = service.crear({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  input: {
    deposito_id: deposito.id,
    proveedor_nombre: "Proveedor Demo S.A.",
    proveedor_documento: "30700000001",
    tipo_comprobante: "FACTURA",
    letra: "A",
    punto_venta: 1,
    numero,
    fecha: "2026-10-24",
    crear_factura: 1,
    actualizar_costo: 1,
    actualizar_precio: 1,
    margen_porcentaje: 40,
    total_documento: 242,
    items: [
      {
        producto_id: productoA.id,
        codigo: productoA.codigo,
        descripcion: productoA.descripcion,
        codigo_proveedor: `PROV-${productoA.codigo}`,
        cantidad_facturada: 2,
        cantidad_recibida: 2,
        costo_unitario: 100,
        iva: 21,
      },
    ],
  },
});
assert(inicial.estado === "BORRADOR", "La recepción no quedó en borrador.");
assert(inicial.total === 242, `Total calculado inesperado: ${inicial.total}`);
assert(inicial.items[0].producto_id === productoA.id, "El producto no quedó asociado.");
assert(inicial.items[0].precio_venta_nuevo === 169.4, `Precio sugerido inesperado: ${inicial.items[0].precio_venta_nuevo}`);

const stockAntes = Number(
  db.prepare("SELECT cantidad FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?")
    .get(empresa.id, deposito.id, productoA.id).cantidad,
);
const confirmada = service.confirmar({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  id: inicial.id,
  permisos,
});
assert(confirmada.recepcion.estado === "CONFIRMADA", "No quedó confirmada.");
assert(confirmada.compra_id, "No se generó la compra.");
const stockDespues = Number(
  db.prepare("SELECT cantidad FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?")
    .get(empresa.id, deposito.id, productoA.id).cantidad,
);
assert(stockDespues === stockAntes + 2, `Stock incorrecto: ${stockAntes} -> ${stockDespues}`);
const productoActualizado = db.prepare("SELECT costo, precio, utilidad FROM productos WHERE id=?").get(productoA.id);
assert(productoActualizado.costo === 100, `Costo incorrecto: ${productoActualizado.costo}`);
assert(productoActualizado.precio === 169.4, `Precio incorrecto: ${productoActualizado.precio}`);
const compra = db.prepare("SELECT * FROM compras WHERE id=?").get(confirmada.compra_id);
assert(compra.total === 242 && compra.neto_gravado === 200 && compra.iva_total === 42, "La compra no coincide con el comprobante.");
const mapeo = db.prepare("SELECT * FROM producto_proveedores WHERE empresa_id=? AND producto_id=?").get(empresa.id, productoA.id);
assert(mapeo && mapeo.codigo_proveedor === `PROV-${productoA.codigo}`, "No se guardó el código de proveedor.");
const eventos = db.prepare("SELECT tipo FROM recepcion_eventos WHERE recepcion_id=? ORDER BY id").all(inicial.id);
assert(eventos.some((e) => e.tipo === "CONFIRMACION"), "No se registró el evento de confirmación.");

const idempotente = service.confirmar({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  id: inicial.id,
  permisos,
});
assert(idempotente.idempotente === true, "La segunda confirmación no fue idempotente.");
assert(
  Number(db.prepare("SELECT cantidad FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?")
    .get(empresa.id, deposito.id, productoA.id).cantidad) === stockDespues,
  "La confirmación repetida movió stock otra vez.",
);

errorEsperado(
  () => service.crear({
    empresaId: empresa.id,
    usuarioId: usuario.id,
    input: {
      deposito_id: deposito.id,
      proveedor_nombre: "Proveedor Demo S.A.",
      tipo_comprobante: "FACTURA",
      punto_venta: 1,
      numero,
      fecha: "2026-10-24",
      crear_factura: 1,
      items: [{ producto_id: productoA.id, cantidad_facturada: 1, cantidad_recibida: 1, costo_unitario: 100, iva: 21 }],
    },
  }).id && service.confirmar({
    empresaId: empresa.id,
    usuarioId: usuario.id,
    id: db.prepare("SELECT id FROM recepciones_mercaderia ORDER BY id DESC LIMIT 1").get().id,
    permisos,
  }),
  409,
  "ya está registrado",
);

const parcial = service.crear({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  input: {
    deposito_id: deposito.id,
    tipo_comprobante: "REMITO",
    numero: `${numero}-P`,
    fecha: "2026-10-24",
    items: [
      { producto_id: productoA.id, cantidad_facturada: 2, cantidad_recibida: 2, costo_unitario: 100, iva: 21 },
      { producto_id: productoB.id, cantidad_facturada: 1, cantidad_recibida: 0, costo_unitario: 50, iva: 21 },
    ],
  },
});
errorEsperado(
  () => service.confirmar({ empresaId: empresa.id, usuarioId: usuario.id, id: parcial.id, permisos }),
  400,
  "sin recibir",
);
service.actualizar({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  id: parcial.id,
  input: { ...parcial, permitir_parcial: 1, items: parcial.items },
});
const parcialConfirmada = service.confirmar({ empresaId: empresa.id, usuarioId: usuario.id, id: parcial.id, permisos });
assert(parcialConfirmada.recepcion.estado === "CONFIRMADA", "No se pudo confirmar la recepción parcial.");
assert(parcialConfirmada.movimientos.length === 1, "La recepción parcial movió renglones sin recibir.");

const sinPermiso = service.crear({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  input: {
    deposito_id: deposito.id,
    tipo_comprobante: "REMITO",
    numero: `${numero}-NP`,
    fecha: "2026-10-24",
    actualizar_costo: 1,
    items: [{ producto_id: productoB.id, cantidad_facturada: 1, cantidad_recibida: 1, costo_unitario: 80, iva: 21 }],
  },
});
errorEsperado(
  () => service.confirmar({
    empresaId: empresa.id,
    usuarioId: usuario.id,
    id: sinPermiso.id,
    permisos: ["recepcion.confirmar"],
  }),
  403,
  "productos.costos",
);

service.anular({ empresaId: empresa.id, usuarioId: usuario.id, id: sinPermiso.id });
errorEsperado(
  () => service.confirmar({ empresaId: empresa.id, usuarioId: usuario.id, id: sinPermiso.id, permisos }),
  409,
  "no está en borrador",
);

const facturaC = service.crear({
  empresaId: empresa.id,
  usuarioId: usuario.id,
  input: {
    deposito_id: deposito.id,
    proveedor_nombre: "Proveedor Demo S.A.",
    proveedor_documento: "30700000001",
    tipo_comprobante: "FACTURA",
    letra: "C",
    punto_venta: 1,
    numero: `${numero}-C`,
    fecha: "2026-10-24",
    crear_factura: 1,
    actualizar_costo: 1,
    costo_incluye_iva: 1,
    total_documento: 121,
    items: [{ producto_id: productoB.id, cantidad_facturada: 1, cantidad_recibida: 1, costo_unitario: 121, iva: 21 }],
  },
});
const confirmadaC = service.confirmar({ empresaId: empresa.id, usuarioId: usuario.id, id: facturaC.id, permisos });
const compraC = db.prepare("SELECT neto_gravado, iva_total, total FROM compras WHERE id=?").get(confirmadaC.compra_id);
assert(compraC.neto_gravado === 121 && compraC.iva_total === 0 && compraC.total === 121, "La factura C no se registró como neto total.");
assert(
  Number(db.prepare("SELECT costo FROM productos WHERE id=?").get(productoB.id).costo) === 100,
  "El costo neto de una factura C no se calculó desde el precio final.",
);

const normalizado = ocr.normalizarResultado({
  proveedor_nombre: "Proveedor OCR",
  total: 121,
  items: [{ codigo: "001", descripcion: "Producto OCR", cantidad: 2, costo_unitario: 50, iva: 21 }],
});
assert(normalizado.items.length === 1, "El OCR no normalizó el renglón.");
assert(normalizado.items[0].cantidad_recibida === 2, "La cantidad recibida inicial no quedó igual a la facturada.");
assert(normalizado.items[0].importe === 121, `Importe OCR inesperado: ${normalizado.items[0].importe}`);
assert(normalizado.items[0].codigo === "001", "Se perdieron los ceros del código.");

console.log("OK recepción de mercadería: borrador, compra, stock, costos/precios, idempotencia, parciales y permisos.");
