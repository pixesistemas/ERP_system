const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/escpos-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

/* AFIP simulado: en la prueba no hay certificados ni internet. */
const fiscalPath = require.resolve("../src/afip/fiscalEmission.service");
class FiscalNetworkError extends Error {}
let comprobanteEmulado = { numero: 987654, tipo: 6, letra: "B", nombre: "FACTURA B" };
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
        numero: comprobanteEmulado.numero,
        cae: "70123456789012",
        vencimiento: "2026-11-25",
        tipoComprobante: comprobanteEmulado.tipo,
        letra: comprobanteEmulado.letra,
        nombreComprobante: comprobanteEmulado.nombre,
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
  /* Factura B: precios finales también en el detalle y sin discriminar IVA. */
  if (!texto.includes("1 x $1.210,00")) throw new Error("El detalle de la factura B no muestra el precio final con IVA.");
  if (texto.includes("Neto")) throw new Error("La factura B no debe discriminar el Neto.");
  /* RG 5614/2024: leyenda de transparencia fiscal a consumidor final. */
  if (!texto.includes("Transparencia Fiscal al") || !texto.includes("Consumidor (Ley 27.743)")) throw new Error("Falta la leyenda de transparencia fiscal.");
  if (!texto.includes("IVA Contenido: $210,00")) throw new Error("Falta el IVA contenido de la factura B (210,00).");
  if (!texto.includes("Otros Impuestos Nacionales Indirectos: $0,00")) throw new Error("Falta el renglón de otros impuestos nacionales.");
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
  if (!bufNota.toString("latin1").includes("1 x $605,00")) throw new Error("La nota de venta no muestra el precio final en el detalle.");
  if (bufNota.toString("latin1").includes("Transparencia Fiscal")) throw new Error("La nota de venta no debe llevar la leyenda de transparencia.");
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

  /* Factura A: sigue discriminando IVA (sin leyenda de transparencia). */
  comprobanteEmulado = { numero: 776655, tipo: 1, letra: "A", nombre: "FACTURA A" };
  const facturaA = await conRespuesta(erp.createPosOperation, {
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
  });
  if (facturaA.status !== 201 || !facturaA.payload?.ok) throw new Error(`No se pudo crear la factura A: ${JSON.stringify(facturaA.payload)}`);
  const ticketA = await conRespuesta(erp.ticketEscposOperacion, {}, { id: String(facturaA.payload.operation.saleId) });
  const textoA = Buffer.from(ticketA.payload.base64, "base64").toString("latin1");
  if (!textoA.includes("Neto") || !textoA.includes("IVA")) throw new Error("La factura A debe discriminar Neto e IVA.");
  const posNeto = textoA.indexOf("Neto");
  const posIva = textoA.indexOf("IVA");
  const posTotal = textoA.indexOf("TOTAL");
  if (!(posNeto >= 0 && posIva > posNeto && posTotal > posIva)) throw new Error("El orden debe ser Neto, IVA y TOTAL.");
  if (!textoA.includes("\x1bE\x01TOTAL")) throw new Error("El TOTAL debe imprimirse en negrita.");
  if (textoA.includes("Transparencia Fiscal")) throw new Error("La factura A no lleva la leyenda de consumidor final.");

  /* Tildes de superadmin: ocultar datos fiscales (CUIT/IIBB/IVA) y QR. */
  db.prepare(
    `INSERT INTO comprobante_plantillas(empresa_id,tipo,configuracion_json) VALUES(?,?,?)
     ON CONFLICT(empresa_id,tipo) DO UPDATE SET configuracion_json=excluded.configuracion_json`,
  ).run(empresa.id, "GENERAL", JSON.stringify({ mostrarDatosFiscales: false, mostrarQR: false }));

  const ticketOculto = await conRespuesta(erp.ticketEscposOperacion, {}, { id: String(facturaA.payload.operation.saleId) });
  const bufOculto = Buffer.from(ticketOculto.payload.base64, "base64");
  const textoOculto = bufOculto.toString("latin1");
  if (textoOculto.includes("CUIT ")) throw new Error("El tilde de datos fiscales no ocultó el CUIT en ESC/POS.");
  if (bufOculto.indexOf(Buffer.from([0x1d, 0x28, 0x6b])) >= 0) throw new Error("El tilde de QR no ocultó el QR fiscal en ESC/POS.");
  if (textoOculto.includes("CAE:")) throw new Error("El tilde de QR / CAE fiscal no ocultó el bloque fiscal en ESC/POS.");

  /* La misma plantilla se respeta en el ticket HTML (impresión por navegador). */
  const saleHtml = db
    .prepare(
      `SELECT v.*,c.razon_social cliente,c.cuit,c.dni,p.formato_impresion,d.cae,d.cae_vencimiento,d.comprobante_tipo_afip,
       d.importe_neto documento_neto,d.importe_iva documento_iva,d.importe_total documento_total
       FROM ventas_pos v LEFT JOIN clientes c ON c.id=v.cliente_id
       LEFT JOIN puntos_venta p ON p.empresa_id=v.empresa_id AND p.numero=v.punto_venta
       LEFT JOIN documentos_comerciales d ON d.id=v.documento_id WHERE v.id=? AND v.empresa_id=?`,
    )
    .get(facturaA.payload.operation.saleId, empresa.id);
  saleHtml.neto = saleHtml.documento_neto;
  saleHtml.ivaImporte = saleHtml.documento_iva;
  saleHtml.totalFiscal = saleHtml.documento_total;
  const itemsHtml = db.prepare("SELECT * FROM venta_pos_items WHERE venta_id=?").all(facturaA.payload.operation.saleId);
  const TicketDocumentEngine = require("../src/documents/engine/ticketDocumentEngine");
  const { getEmpresaById } = require("../src/repositories/empresa.repository");
  const htmlOculto = await TicketDocumentEngine.render({ empresa: getEmpresaById(empresa.id), sale: saleHtml, items: itemsHtml });
  if (htmlOculto.includes('<strong>CUIT:</strong>')) throw new Error("El tilde de datos fiscales no ocultó el CUIT en el ticket HTML.");
  if (htmlOculto.includes('<strong>Ingresos Brutos:</strong>')) throw new Error("El tilde de datos fiscales no ocultó IIBB en el ticket HTML.");
  if (htmlOculto.includes("afip.gob.ar/fe/qr")) throw new Error("El tilde de QR no ocultó el QR en el ticket HTML.");

  console.log("escpos: OK — factura B con precios finales, sin discriminación y con RG 5614 (IVA contenido); factura A discriminada; nota de venta final; QR, CP437 y corte; tildes de datos fiscales y QR respetados en ESC/POS y HTML.");
})();
