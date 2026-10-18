const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/escpos-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

/* AFIP simulado: en la prueba no hay certificados ni internet. */
const fiscalPath = require.resolve("../src/afip/fiscalEmission.service");
class FiscalNetworkError extends Error {}
require.cache[fiscalPath] = {
  id: fiscalPath,
  filename: fiscalPath,
  loaded: true,
  exports: {
    FiscalNetworkError,
    emitirComprobanteAfip: async ({ items = [] }) => {
      const neto = items.reduce((n, x) => n + Number(x.precio_unitario || x.precio || 0) * Number(x.cantidad || 0), 0);
      const importeNeto = Math.round(neto * 100) / 100;
      const importeIva = Math.round(importeNeto * 0.21 * 100) / 100;
      return {
        ok: true,
        numero: 987654,
        cae: "70123456789012",
        vencimiento: "2026-11-25",
        tipoComprobante: 6,
        letra: "B",
        nombreComprobante: "FACTURA B",
        resultado: "A",
        importeNeto,
        importeIva,
        importeTotal: Math.round((importeNeto + importeIva) * 100) / 100,
      };
    },
  },
};

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const erp = require("../src/controllers/erpConsolidation.controller");

const empresa = db.prepare("SELECT * FROM empresas WHERE nombre='empresa1'").get();
const producto = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const branch = db.prepare("SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const cashier = db.prepare("SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const pv = db.prepare("SELECT id FROM puntos_venta WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
if (!empresa || !producto || !branch || !cashier || !pv) throw new Error("El seed demo no tiene datos suficientes.");

function conRespuesta(fn, body = {}, params = {}, query = {}) {
  let status = 200;
  let payload = null;
  const req = { empresa: { id: empresa.id }, user: { id: 1, empresaId: empresa.id }, usuario: { id: 1, empresaId: empresa.id }, body, params, query };
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
  return Promise.resolve(fn(req, res)).then(() => ({ status, payload }));
}

function item(precio = 1000, cantidad = 1) {
  return {
    producto_id: producto.id,
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    unidad: "UN",
    cantidad,
    precio_unitario: precio,
    iva: 21,
    costo: 0,
  };
}

(async () => {
  /* Venta fiscal: el ticket ESC/POS debe salir con CAE y QR. */
  const factura = await conRespuesta(
    erp.createPosOperation,
    {
      mode: "NORMAL",
      document_kind: "FACTURA_ELECTRONICA",
      cliente_nombre: "CONSUMIDOR FINAL",
      sucursal_id: branch.id,
      cajero_id: cashier.id,
      punto_venta: 1,
      condicion_pago: "CONTADO",
      subtotal: 1000,
      total: 1210,
      pagos: { EFECTIVO: 1210 },
      items: [item(1000, 1)],
    },
  );
  if (factura.status !== 201 || !factura.payload?.ok) throw new Error(`No se pudo crear la factura: ${JSON.stringify(factura.payload)}`);
  const saleId = factura.payload.operation.saleId;

  const ticket = await conRespuesta(erp.ticketEscposOperacion, {}, { id: String(saleId) });
  if (ticket.status !== 200 || !ticket.payload?.ok) throw new Error(`No se generó el ticket ESC/POS: ${JSON.stringify(ticket.payload)}`);
  const buf = Buffer.from(ticket.payload.base64, "base64");
  const texto = buf.toString("latin1");

  if (!texto.includes("FACTURA")) throw new Error("El ticket no menciona el tipo de comprobante.");
  if (!texto.includes("TOTAL")) throw new Error("El ticket no incluye el total.");
  if (!texto.includes("CAE: 70123456789012")) throw new Error("El ticket no incluye el CAE.");
  if (!texto.includes("Comprobante autorizado por ARCA")) throw new Error("Falta la leyenda fiscal.");
  const qr = buf.indexOf(Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 50, 0]));
  if (qr < 0) throw new Error("El ticket fiscal no incluye el comando de QR ESC/POS.");
  const corte = buf.indexOf(Buffer.from([0x1d, 0x56, 0x00]));
  if (corte < 0) throw new Error("El ticket no incluye el corte de papel.");
  if (buf.indexOf(Buffer.from([0x1b, 0x40])) !== 0) throw new Error("El ticket no arranca con el comando de inicialización.");
  /* Acentos a CP437: la "ó" de "Condición" debe salir como 0xA2 (CP437), no como UTF-8. */
  if (!buf.includes(0xa2)) throw new Error("Los acentos no se convirtieron a CP437.");
  if (buf.includes(Buffer.from("ó", "utf8"))) throw new Error("Quedaron caracteres UTF-8 sin convertir.");

  /* Nota de venta: sin CAE, con leyenda de no válido como factura y sin QR. */
  const nota = await conRespuesta(erp.createPosOperation, {
    mode: "NORMAL",
    document_kind: "NOTA_X",
    cliente_nombre: "CONSUMIDOR FINAL",
    sucursal_id: branch.id,
    cajero_id: cashier.id,
    punto_venta: 1,
    condicion_pago: "CONTADO",
    subtotal: 500,
    total: 500,
    pagos: { EFECTIVO: 500 },
    items: [item(500, 1)],
  });
  if (nota.status !== 201 || !nota.payload?.ok) throw new Error(`No se pudo crear la nota de venta: ${JSON.stringify(nota.payload)}`);
  const ticketNota = await conRespuesta(erp.ticketEscposOperacion, {}, { id: String(nota.payload.operation.saleId) });
  const bufNota = Buffer.from(ticketNota.payload.base64, "base64");
  if (!bufNota.toString("latin1").includes("NOTA DE VENTA")) throw new Error("La nota de venta no lleva su nombre en el ticket.");
  /* La leyenda lleva "VÁLIDO" con Á, que en CP437 es 0xB5 (no texto UTF-8). */
  if (!bufNota.toString("latin1").includes("DOCUMENTO NO V") || !bufNota.toString("latin1").includes("COMO FACTURA")) {
    throw new Error("Falta la leyenda de documento no válido.");
  }
  if (bufNota.indexOf(Buffer.from([0x1d, 0x28, 0x6b])) >= 0) throw new Error("La nota de venta no debe llevar QR fiscal.");

  /* Ticket de prueba del punto de venta. */
  const prueba = await conRespuesta(erp.ticketPruebaEscpos, {}, { id: String(pv.id) });
  if (prueba.status !== 200 || !prueba.payload?.ok) throw new Error(`No se generó el ticket de prueba: ${JSON.stringify(prueba.payload)}`);
  const bufPrueba = Buffer.from(prueba.payload.base64, "base64");
  if (!bufPrueba.toString("latin1").includes("TICKET DE PRUEBA")) throw new Error("El ticket de prueba no se identifica como tal.");

  console.log("escpos: OK — factura con CAE y QR ESC/POS, nota de venta sin QR con leyenda, acentos en CP437, corte de papel y ticket de prueba.");
})();
