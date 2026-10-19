const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/documentos-pdf-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const CommercialDocumentEngine = require("../src/documents/engine/commercialDocumentEngine");
const TicketDocumentEngine = require("../src/documents/engine/ticketDocumentEngine");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const empresa = db.prepare("SELECT * FROM empresas WHERE id=1").get();
const cliente = { razonSocial: "Cliente PDF", domicilio: "Av. Siempre Abierta 123", condicionIVA: "CONSUMIDOR FINAL" };
const vendedor = { nombre: "Vendedor PDF" };

(async () => {
const venta80 = await TicketDocumentEngine.render({
  empresa,
  sale: {
    tipo: "FACTURA",
    formato_impresion: "80MM",
    punto_venta: 1,
    numero: 1,
    fecha: "2026-10-19T12:00:00",
    cliente: cliente.razonSocial,
    condicion_pago: "CONTADO",
    total: 100,
    neto: 100,
    ivaImporte: 0,
  },
  items: [],
});
assert(/class="page page-ticket80"/.test(venta80), "El ticket de 80 mm no trae la marca page-ticket80.");

const ventaA4 = await TicketDocumentEngine.render({
  empresa,
  sale: {
    tipo: "FACTURA",
    formato_impresion: "A4",
    punto_venta: 1,
    numero: 2,
    fecha: "2026-10-19T12:00:00",
    cliente: cliente.razonSocial,
    condicion_pago: "CONTADO",
    total: 100,
    neto: 100,
    ivaImporte: 0,
  },
  items: [],
});
assert(!/class="page page-ticket80"/.test(ventaA4), "Una factura A4 quedó marcada como ticket de 80 mm.");

const baseDocumento = {
  punto_venta: 1,
  numero: 10,
  fecha: "2026-10-19T12:00:00",
  condicion_venta: "CONTADO",
  importe_neto: 100,
  importe_iva: 21,
  importe_total: 121,
  importe_bruto: 100,
  descuento_general: 0,
  descuento_importe: 0,
  items: [],
};

const presupuesto = CommercialDocumentEngine.render({
  empresa,
  documento: { ...baseDocumento, tipo: "PRESUPUESTO" },
  cliente,
  vendedor,
});
assert(!/class="page page-ticket80"/.test(presupuesto), "El presupuesto quedó marcado como ticket de 80 mm.");
assert(!/class="info-highlight"/.test(presupuesto), "El presupuesto no debe llevar los destacados de nota de pedido/remito.");

const notaPedido = CommercialDocumentEngine.render({
  empresa,
  documento: { ...baseDocumento, tipo: "NOTA_PEDIDO" },
  cliente,
  vendedor,
});
assert(/Vendedor PDF/.test(notaPedido), "La nota de pedido no muestra el vendedor.");
assert(/class="info-highlight"/.test(notaPedido), "La nota de pedido no destaca vendedor/dirección.");
assert(/Av\. Siempre Abierta 123/.test(notaPedido), "La nota de pedido no muestra la dirección del cliente.");

const remito = CommercialDocumentEngine.render({
  empresa,
  documento: { ...baseDocumento, tipo: "REMITO" },
  cliente,
  vendedor,
});
assert(/class="info-highlight"/.test(remito), "El remito no destaca la dirección del cliente.");

const presupuestoRecargo = CommercialDocumentEngine.render({
  empresa,
  documento: { ...baseDocumento, tipo: "PRESUPUESTO", importe_total: 110, recargo_general: 10 },
  cliente,
  vendedor,
});
assert(/Recargo/.test(presupuestoRecargo), "El presupuesto no muestra el recargo general.");

console.log("OK PDFs: ticket 80mm vs A4, vendedor/dirección en nota de pedido y remito, recargo en totales.");
})().catch((error) => { console.error(error); process.exit(1); });
