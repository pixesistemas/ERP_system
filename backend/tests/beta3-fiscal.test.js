const fs = require('fs');
const path = require('path');
const testDb = path.join(__dirname, '../data/beta3-test.db');
process.env.DB_PATH = testDb;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
const bootstrap = require('../src/db/bootstrap');
bootstrap();
const db = require('../src/db/database');
const erp = require('../src/controllers/erpConsolidation.controller');
const { AFIPClient } = require('../src/afip');

/*
 * Test de punta a punta de la etapa fiscal: cierre de POS con
 * factura electrónica usando un stub de WSFE (no hay red contra ARCA).
 * Escenarios: autorización, rechazo, caída de red con venta PENDIENTE,
 * reintento de CAE y nota de crédito con CbteAsoc.
 */

const empresa = db.prepare("SELECT id FROM empresas WHERE nombre='empresa1'").get();
const branch = db.prepare('SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const cashier = db.prepare('SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare("UPDATE empresas SET cuit='20939802593',condicion_iva='RI',cert_path='src/certificates/empresa1/cert.crt',key_path='src/certificates/empresa1/private.key',production=0 WHERE id=?").run(empresa.id);
const client = db.prepare('SELECT * FROM clientes WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare("UPDATE clientes SET cuit='30500000001',condicion_iva='RI' WHERE id=?").run(client.id);
const product = db.prepare('SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const deposito = db.prepare('SELECT id FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo) VALUES(?,?,?,?,0)').run(empresa.id, deposito.id, product.id, 100);
db.prepare('UPDATE stock_productos SET cantidad=100 WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(empresa.id, deposito.id, product.id);

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

let wsfeBehavior = null;
AFIPClient.fromEmpresa = () => ({
  wsfe: {
    async createInvoice(data) {
      if (typeof wsfeBehavior === 'function') return wsfeBehavior(data);
      return wsfeBehavior;
    },
  },
});

let ventaCount = () => db.prepare('SELECT COUNT(*) n FROM ventas_pos').get().n;
const itemPayload = (iva = 21, precio = 1000) => [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: precio, iva }];
const basePayload = (extra = {}) => ({
  mode: 'NORMAL', document_kind: 'FACTURA_ELECTRONICA', cliente_id: client.id, cliente_nombre: client.razon_social,
  sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CONTADO',
  subtotal: 1000, total: 1210, items: itemPayload(),
  ...extra,
});

(async () => {
  let fiscalIntentoCount = () => db.prepare('SELECT COUNT(*) n FROM fiscal_intentos').get().n;

  wsfeBehavior = {
    ok: true, resultado: 'A', cae: '65626266267299', vencimiento: '20260831', numero: 50000101,
    observaciones: null, errores: null, raw: { dummy: true },
  };
  let r = await run(erp.createPosOperation, req(basePayload()));
  if (r.status !== 201) throw new Error(`Factura autorizada: esperaba 201, obtuve ${r.status}`);
  const op1 = r.payload.operation;
  if (op1.afipEstado !== 'AUTORIZADO' || op1.cae !== '65626266267299' || op1.number !== 50000101) throw new Error('La factura autorizada no expuso CAE/estado.');
  const doc1 = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(op1.documentId);
  if (doc1.afip_estado !== 'AUTORIZADO' || doc1.cae !== '65626266267299' || doc1.comprobante_tipo_afip !== 1) throw new Error('El documento no guardó el CAE ni el tipo Factura A.');
  if (fiscalIntentoCount() !== 1) throw new Error('No se registró el intento AUTORIZADO.');

  wsfeBehavior = {
    ok: false, resultado: 'R', cae: null, vencimiento: null, numero: null,
    observaciones: [{ Code: 10015, Msg: 'Comprobante rechazado de prueba' }], errores: null, raw: {},
  };
  const antes = ventaCount();
  r = await run(erp.createPosOperation, req(basePayload()));
  if (r.status !== 422) throw new Error(`Rechazo AFIP: esperaba 422, obtuve ${r.status}`);
  if (ventaCount() !== antes) throw new Error('El rechazo de AFIP no debe registrar la venta.');
  if (db.prepare("SELECT COUNT(*) n FROM fiscal_intentos WHERE estado='RECHAZADO'").get().n !== 1) throw new Error('No se registró el intento RECHAZADO.');

  wsfeBehavior = null;
  AFIPClient.fromEmpresa = () => ({
    wsfe: {
      async createInvoice() {
        const error = new Error('connect ETIMEDOUT');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    },
  });
  const ventasAntes = ventaCount();
  r = await run(erp.createPosOperation, req(basePayload()));
  if (r.status !== 201) throw new Error(`ARCA caído: esperaba 201 con venta PENDIENTE, obtuve ${r.status}`);
  const op2 = r.payload.operation;
  if (op2.afipEstado !== 'PENDIENTE' || op2.cae !== null || !op2.fiscalError) throw new Error('La venta no quedó PENDIENTE de CAE con su error.');
  if (ventaCount() !== ventasAntes + 1) throw new Error('La venta PENDIENTE no se registró (stock/caja deben moverse igual).');
  if (db.prepare("SELECT COUNT(*) n FROM fiscal_intentos WHERE estado='ERROR_RED'").get().n !== 1) throw new Error('No se registró el intento ERROR_RED.');

  wsfeBehavior = {
    ok: true, resultado: 'A', cae: '65626266267300', vencimiento: '20260831', numero: 50000102,
    observaciones: null, errores: null, raw: {},
  };
  AFIPClient.fromEmpresa = () => ({
    wsfe: {
      async createInvoice() {
        return wsfeBehavior;
      },
    },
  });
  r = await run(erp.retryFiscalCae, req({}, { id: op2.saleId }));
  if (r.status !== 200 || !r.payload.ok) throw new Error(`El reintento de CAE falló: ${r.status} ${r.payload?.error || ''}`);
  const retryOp = r.payload.operation;
  if (retryOp.cae !== '65626266267300' || retryOp.number !== 50000102) throw new Error('El reintento no devolvió el CAE nuevo.');
  const doc2 = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(op2.documentId);
  if (doc2.afip_estado !== 'AUTORIZADO' || doc2.cae !== '65626266267300' || doc2.numero !== 50000102) throw new Error('El documento PENDIENTE no se actualizó tras el reintento.');
  const sale2 = db.prepare('SELECT * FROM ventas_pos WHERE id=?').get(op2.saleId);
  if (sale2.numero !== 50000102) throw new Error('La venta no adoptó el número de AFIP tras el reintento.');
  if (db.prepare("SELECT COUNT(*) n FROM fiscal_intentos WHERE estado='AUTORIZADO'").get().n !== 2) throw new Error('El reintento no registró su intento AUTORIZADO.');

  r = await run(erp.retryFiscalCae, req({}, { id: op1.saleId }));
  if (r.status !== 409) throw new Error('Una factura ya autorizada no debe admitir reintento.');

  wsfeBehavior = {
    ok: true, resultado: 'A', cae: '65626266267301', vencimiento: '20260831', numero: 50000103,
    observaciones: null, errores: null, raw: {},
  };
  r = await run(erp.emitirNotaCredito, req({}, { id: op1.saleId }));
  if (r.status !== 201) throw new Error(`Nota de crédito: esperaba 201, obtuve ${r.status} ${r.payload?.error || ''}`);
  const nc = r.payload.nota;
  if (nc.tipo !== 'NOTA_CREDITO' || nc.cae !== '65626266267301' || nc.comprobanteLetra !== 'A') throw new Error('La NC no se autorizó como Nota de Crédito A.');
  const rel = db.prepare('SELECT * FROM documento_relaciones WHERE documento_origen_id=? AND documento_destino_id=?').get(op1.documentId, nc.documentId);
  if (!rel || rel.tipo !== 'NC') throw new Error('No se registró la relación factura → NC.');
  if (db.prepare("SELECT COUNT(*) n FROM fiscal_intentos WHERE operacion='NOTA_CREDITO' AND estado='AUTORIZADO'").get().n !== 1) throw new Error('La NC no registró su intento.');

  console.log('OK Beta 3: factura A con CAE, rechazo sin registro, venta PENDIENTE con ARCA caído, reintento de CAE y nota de crédito con CbteAsoc.');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
})().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
