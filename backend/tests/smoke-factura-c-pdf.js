const fs = require('fs');
const path = require('path');
const testDb = path.join(__dirname, '../data/smoke-c-pdf.db');
process.env.DB_PATH = testDb;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
const bootstrap = require('../src/db/bootstrap');
bootstrap();
const db = require('../src/db/database');
const erp = require('../src/controllers/erpConsolidation.controller');
const CommercialPDFService = require('../src/pdf/commercialPdf.service');
const { AFIPClient } = require('../src/afip');

/*
 * Smoke: factura B (emisor RI) y factura C (monotributo) por POS.
 * - B: el emisor discrimina IVA ante AFIP (neto + 21% + total = precio
 *   final del catálogo). El total a cobrar es el precio final.
 * - C: el emisor no discrimina; ImpNeto = ImpTotal = precio final.
 * Verifica los ítems persistidos, importe_total y que el PDF muestre
 * el total final en ambos casos.
 */

const empresa = db.prepare("SELECT id,nombre,razon_social,condicion_iva FROM empresas WHERE nombre='empresa1'").get();
const branch = db.prepare('SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const cashier = db.prepare('SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare("UPDATE empresas SET cuit='20939802593',condicion_iva='RI',cert_path='src/certificates/empresa1/cert.crt',key_path='src/certificates/empresa1/private.key',production=0 WHERE id=?").run(empresa.id);
const product = db.prepare('SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const deposito = db.prepare('SELECT id FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo) VALUES(?,?,?,?,0)').run(empresa.id, deposito.id, product.id, 100);
db.prepare('UPDATE stock_productos SET cantidad=100 WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(empresa.id, deposito.id, product.id);

const resCF = db.prepare("INSERT INTO clientes(empresa_id,razon_social,condicion_iva) VALUES(?,?,?)").run(empresa.id, 'JUAN SIN CUIT', 'CF');
const cliente = { id: resCF.lastInsertRowid, razon_social: 'JUAN SIN CUIT', condicion_iva: 'CF' };

const req = (body = {}, params = {}, query = {}) => ({ body, params, query, empresa: { id: empresa.id }, user: { id: 1, empresaId: empresa.id } });
async function run(fn, r) {
  let status = 200;
  let payload;
  const res = {
    status(v) { status = v; return this; },
    json(v) { payload = v; return v; },
    send(v) { payload = v; return v; },
  };
  await fn(r, res);
  return { status, payload };
}

let stubNumero = 50000100;
AFIPClient.fromEmpresa = () => ({
  wsfe: {
    async createInvoice() {
      stubNumero += 1;
      return { ok: true, resultado: 'A', cae: '65626266267299', vencimiento: '20260831', numero: stubNumero, observaciones: null, errores: null };
    },
  },
});

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  process.exit(1);
}

async function emitirYVerificar(condicionEmpresa, letraEsperada) {
  const neto = 6900;
  const ivaPorc = 21;
  const totalEsperado = Math.round(neto * 1.21 * 100) / 100; // 8349
  const discrimina = String(condicionEmpresa).toUpperCase() === 'RESPONSABLE INSCRIPTO' || String(condicionEmpresa).toUpperCase() === 'RI';

  db.prepare('UPDATE empresas SET condicion_iva=? WHERE id=?').run(condicionEmpresa, empresa.id);

  const r = await run(erp.createPosOperation, req({
    mode: 'NORMAL', document_kind: 'FACTURA_ELECTRONICA', cliente_id: cliente.id, cliente_nombre: cliente.razon_social,
    sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CONTADO',
    subtotal: discrimina ? neto : totalEsperado, total: totalEsperado,
    items: [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: neto, iva: ivaPorc }],
  }));
  if (r.status !== 201) fail(`${condicionEmpresa}: esperaba 201, obtuve ${r.status} (${r.payload?.error || ''})`);
  const docId = r.payload.operation?.documentId;
  if (!docId) fail(`${condicionEmpresa}: no se devolvió documentId`);

  const doc = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(docId);
  if (Number(doc.importe_total) !== totalEsperado) fail(`${condicionEmpresa}: importe_total ${doc.importe_total} != ${totalEsperado}`);
  if (doc.comprobante_letra !== letraEsperada) fail(`${condicionEmpresa}: letra esperada ${letraEsperada}, obtuve ${doc.comprobante_letra}`);

  const items = db.prepare('SELECT * FROM documento_items WHERE documento_id=?').all(docId);
  if (items.length !== 1) fail(`${condicionEmpresa}: se esperaba 1 ítem`);
  const it = items[0];
  if (Math.round(Number(it.total) * 100) / 100 !== totalEsperado) fail(`${condicionEmpresa}: total del ítem ${it.total} != ${totalEsperado}`);
  const ivaEsperado = discrimina ? Math.round(neto * 0.21 * 100) / 100 : 0;
  const subtotalEsperado = discrimina ? neto : totalEsperado;
  if (Math.round(Number(it.subtotal) * 100) / 100 !== subtotalEsperado) fail(`${condicionEmpresa}: subtotal del ítem ${it.subtotal} != ${subtotalEsperado}`);
  if (Math.round(Number(it.iva_importe) * 100) / 100 !== ivaEsperado) fail(`${condicionEmpresa}: iva_importe del ítem ${it.iva_importe} != ${ivaEsperado}`);
  const suma = Math.round(items.reduce((n, x) => n + Number(x.total), 0) * 100) / 100;
  if (suma !== totalEsperado) fail(`${condicionEmpresa}: Σ totales ítems ${suma} != importe_total ${totalEsperado}`);

  const html = await CommercialPDFService.renderFiscalHtml({
    empresa: { ...empresa, logo: '' },
    documento: { ...doc, items },
    cliente: { razonSocial: cliente.razon_social, condicion_iva: 'CF' },
  });
  const totalConFormato = totalEsperado.toLocaleString('es-AR', { minimumFractionDigits: 2 });
  if (!html.includes(totalConFormato)) fail(`${condicionEmpresa}: el PDF fiscal no muestra el total $ ${totalConFormato}`);

  console.log(`✓ ${condicionEmpresa} (letra ${letraEsperada}): ítem $ ${it.subtotal} neto + $ ${it.iva_importe} IVA = $ ${it.total}, doc $ ${doc.importe_total}, PDF muestra $ ${totalConFormato}`);
}

(async () => {
  await emitirYVerificar('RESPONSABLE INSCRIPTO', 'B');
  await emitirYVerificar('MONOTRIBUTO', 'C');
  console.log('✓ Smoke facturas B (RI, con IVA interno) y C (monotributo, sin IVA) OK');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
})().catch((e) => { console.error('✗ Smoke error:', e); process.exit(1); });
