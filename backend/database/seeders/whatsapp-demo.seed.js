require("dotenv").config();

/*
 * Seed de datos de ejemplo para la Bandeja de WhatsApp (fase 2)
 * y Pedidos por WhatsApp. Es idempotente: actualiza los datos
 * existentes y agrega pedidos demo sin duplicar.
 *
 * Uso: node database/seeders/whatsapp-demo.seed.js
 */

const db = require("../../src/db/database");

const EMPRESA_ID = 1;

const PRECIOS = { CEM25: 7830.01, CAL25: 4650, HIE06: 6900, AREM3: 32500 };

function redondear(v) {
  return Math.round(Number(v) * 100) / 100;
}

function obtenerProducto(codigo) {
  return db
    .prepare(
      "SELECT id,descripcion,iva FROM productos WHERE empresa_id=? AND codigo=?",
    )
    .get(EMPRESA_ID, codigo);
}

function crearPedidoDemo(numero, clienteId, telefono, estadoReparto, lineas) {
  const yaExiste = db
    .prepare(
      "SELECT id FROM documentos_comerciales WHERE empresa_id=? AND tipo='NOTA_PEDIDO' AND numero=?",
    )
    .get(EMPRESA_ID, numero);
  if (yaExiste) return null;

  const total = redondear(
    lineas.reduce((n, [codigo, cantidad]) => n + PRECIOS[codigo] * cantidad, 0),
  );
  const fecha = new Date().toISOString().slice(0, 10);
  const obs = "Pedido por WhatsApp " + telefono;

  const r = db
    .prepare(
      `INSERT INTO documentos_comerciales(empresa_id,cliente_id,tipo,estado,punto_venta,numero,fecha,created_at,updated_at,
        importe_total,importe_bruto,canal,telefono_origen,estado_reparto,observaciones,condicion_venta,lista_precio,descuento_general,descuento_importe,afip_estado)
       VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,'WHATSAPP',?,?,?,'CONTADO','GENERAL',0,0,'SIN_CAE')`,
    )
    .run(
      EMPRESA_ID,
      clienteId,
      "NOTA_PEDIDO",
      "CONFIRMADO",
      1,
      numero,
      fecha,
      total,
      total,
      telefono,
      estadoReparto,
      obs,
    );
  const docId = r.lastInsertRowid;

  const item = db.prepare(
    `INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total)
     VALUES(?,?,?,?,?,?,?,0,?,?,?,?)`,
  );
  for (const [codigo, cantidad] of lineas) {
    const p = obtenerProducto(codigo);
    const subtotal = redondear(PRECIOS[codigo] * cantidad);
    item.run(
      docId,
      p?.id || null,
      codigo,
      p?.descripcion || codigo,
      "UN",
      cantidad,
      PRECIOS[codigo],
      p?.iva ?? 21,
      subtotal,
      0,
      subtotal,
    );
  }

  console.log(`Pedido demo N° ${numero} creado (${obs})`);
  return docId;
}

/* ------------------------------------------------------------------ *
 * 1. Pedido existente (N° 7): precios y totales reales
 * ------------------------------------------------------------------ */
const doc161 = db
  .prepare("SELECT id FROM documentos_comerciales WHERE id=161 AND empresa_id=?")
  .get(EMPRESA_ID);
if (doc161) {
  const precios = [
    [209, "CEM25", 2, 7830.01],
    [210, "CAL25", 1, 4650],
  ];
  for (const [itemId, codigo, cantidad, precio] of precios) {
    const subtotal = redondear(precio * cantidad);
    db.prepare(
      `UPDATE documento_items SET codigo=?,cantidad=?,precio_unitario=?,subtotal=?,total=?
       WHERE id=? AND documento_id=?`,
    ).run(codigo, cantidad, precio, subtotal, subtotal, itemId, 161);
  }
  const total = redondear(2 * 7830.01 + 1 * 4650);
  db.prepare(
    "UPDATE documentos_comerciales SET importe_total=?,importe_bruto=?,estado_reparto='ENTREGADO' WHERE id=161",
  ).run(total, total);
  console.log("Pedido N° 7 actualizado con importes reales: $" + total);
}

/* ------------------------------------------------------------------ *
 * 2. Pedidos adicionales (N° 8 y 9) y numerador
 * ------------------------------------------------------------------ */
const doc8 = crearPedidoDemo(8, 4, "5493454001234", "PREPARANDO", [
  ["CEM25", 5],
  ["HIE06", 10],
]);
const doc9 = crearPedidoDemo(9, 4, "5493454002222", "LISTO", [
  ["CAL25", 4],
  ["AREM3", 1],
]);

db.prepare(
  "UPDATE documento_numeradores SET ultimo_numero=9,updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND tipo='NOTA_PEDIDO' AND punto_venta=1",
).run(EMPRESA_ID);

/* ------------------------------------------------------------------ *
 * 3. Notificaciones: completar teléfonos y sumar las de pedidos 8/9
 * ------------------------------------------------------------------ */
db.prepare("UPDATE whatsapp_notificaciones SET telefono='5493454001234' WHERE id IN (6,7)").run();

if (doc8) {
  const ya = db
    .prepare("SELECT id FROM whatsapp_notificaciones WHERE pedido_id=? AND estado_pedido='PREPARANDO'")
    .get(doc8);
  if (!ya) {
    db.prepare(
      "INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)",
    ).run(
      EMPRESA_ID,
      "5493454001234",
      doc8,
      "PREPARANDO",
      "Estamos preparando tu pedido.",
      "ENVIADA",
    );
  }
}
if (doc9) {
  const ya = db
    .prepare("SELECT id FROM whatsapp_notificaciones WHERE pedido_id=? AND estado_pedido='LISTO'")
    .get(doc9);
  if (!ya) {
    db.prepare(
      "INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)",
    ).run(
      EMPRESA_ID,
      "5493454002222",
      doc9,
      "LISTO",
      "Tu pedido está listo para retirar.",
      "PENDIENTE",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4. Conversaciones: completar los comandos para la demo
 * ------------------------------------------------------------------ */
const ctx6 = JSON.stringify({
  command: {
    operation: "NOTA_PEDIDO",
    customer: { text: "Carlos López", id: 4 },
    products: [
      { codigo: "CEM25", cantidad: 2, descripcion: "CEMENTO PORTLAND X 25 KG", precio: 7830.01, iva: 21 },
      { codigo: "CAL25", cantidad: 1, descripcion: "CAL HIDRATADA X 25 KG", precio: 4650, iva: 21 },
    ],
    payment: null,
    discount: null,
    seller: null,
    priceList: null,
    sourceDocument: null,
    deliveryDate: null,
    notes: [],
    rawMessage: "Carlos López: 2 cemento portland y 1 cal hidratada",
    channel: "WHATSAPP",
  },
  validation: {
    valid: true,
    executable: true,
    errors: [],
    missing: [],
    warnings: [{ field: "payment", code: "PAYMENT_NOT_DEFINED", message: "No se indicó condición de pago." }],
  },
  state: "WAITING_CONFIRMATION",
  telefonoOrigen: "5493454001234",
  workspaceId: 13,
  customerOptions: [],
  productOptions: [],
  pendingProduct: null,
  metadata: {},
});

const ctx7 = JSON.stringify({
  command: {
    operation: "NOTA_PEDIDO",
    customer: { text: "Carlos López", id: 4 },
    products: [
      { codigo: "CEM25", cantidad: 4, descripcion: "CEMENTO PORTLAND X 25 KG", precio: 7830.01, iva: 21 },
      { codigo: "HIE06", cantidad: 12, descripcion: "BARRA DE HIERRO NERVADO 6 MM", precio: 6900, iva: 21 },
    ],
    payment: null,
    discount: null,
    seller: null,
    priceList: null,
    sourceDocument: null,
    deliveryDate: null,
    notes: [],
    rawMessage: "Hola, 4 cementos y 12 hierros del 6 para Carlos López",
    channel: "WHATSAPP",
  },
  validation: {
    valid: true,
    executable: true,
    errors: [],
    missing: [],
    warnings: [],
  },
  state: "WAITING_CONFIRMATION",
  telefonoOrigen: "5493454001234",
  workspaceId: 14,
  customerOptions: [],
  productOptions: [],
  pendingProduct: null,
  metadata: {},
});
db.prepare("UPDATE conversations SET estado='WAITING_CONFIRMATION',contexto=?,updated_at=CURRENT_TIMESTAMP,moderador=1 WHERE id=6").run(ctx6);
db.prepare("UPDATE conversations SET estado='WAITING_CONFIRMATION',contexto=?,updated_at=CURRENT_TIMESTAMP,moderador=0 WHERE id=7").run(ctx7);
db.prepare("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=5").run();

console.log("Conversaciones demo actualizadas (N° 7 pedido listo para crear; N° 6 tomada por vendedor).");
console.log("Seed WhatsApp listo.");
