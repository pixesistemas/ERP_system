const fs = require('fs');
const path = require('path');
const testDb = path.join(__dirname, '../data/beta4-test.db');
process.env.DB_PATH = testDb;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
const bootstrap = require('../src/db/bootstrap');
bootstrap();
const db = require('../src/db/database');
const erp = require('../src/controllers/erpConsolidation.controller');
const { AFIPClient } = require('../src/afip');

/*
 * Test de punta a punta del circuito de notas de pedido del POS:
 * registrar pedido PENDIENTE (sin stock, sin caja), facturarlo
 * (CAE, stock, caja y pagos) y anular otro pedido.
 */

const empresa = db.prepare("SELECT id FROM empresas WHERE nombre='empresa1'").get();
const branch = db.prepare('SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const cashier = db.prepare('SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const seller = db.prepare('SELECT id FROM vendedores WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
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

AFIPClient.fromEmpresa = () => ({
  wsfe: {
    async createInvoice(data) {
      return { ok: true, resultado: 'A', cae: '65626266267400', vencimiento: '20260831', numero: 50000201, observaciones: null, errores: null, raw: {} };
    },
  },
});

const stock = () => db.prepare('SELECT cantidad FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?').get(empresa.id, deposito.id, product.id).cantidad;
const cajaMovs = () => db.prepare('SELECT COUNT(*) n FROM caja_movimientos').get().n;
const itemPayload = (iva = 21, precio = 1000) => [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: precio, iva }];
const pedidoPayload = {
  mode: 'PEDIDO', cliente_id: client.id, cliente_nombre: client.razon_social, vendedor_id: seller.id,
  sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CONTADO',
  subtotal: 1000, total: 1210, items: itemPayload(),
};

(async () => {
  let r = await run(erp.createPosOperation, req(pedidoPayload));
  if (r.status !== 201) throw new Error(`Registro de pedido: esperaba 201, obtuve ${r.status} ${r.payload?.error || ''}`);
const pedido = r.payload.operation;
  if (pedido.type !== 'NOTA_PEDIDO' || pedido.afipEstado !== 'SIN_CAE') throw new Error('El pedido no se registró como NOTA_PEDIDO.');
  const sale1 = db.prepare('SELECT * FROM ventas_pos WHERE id=?').get(pedido.saleId);
  if (sale1.estado !== 'PENDIENTE' || sale1.tipo !== 'NOTA_PEDIDO') throw new Error('El pedido debe quedar PENDIENTE.');
  const doc1 = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(sale1.documento_id);
  if (doc1.estado !== 'BORRADOR' || doc1.tipo !== 'NOTA_PEDIDO') throw new Error('El documento del pedido debe ser BORRADOR.');
  if (stock() !== 100) throw new Error('El pedido no debe descontar stock.');
  if (cajaMovs() !== 0) throw new Error('El pedido no debe registrar caja.');

  r = await run(erp.facturarPedido, req({}, { id: pedido.saleId }));
  if (r.status !== 201) throw new Error(`Facturar pedido: esperaba 201, obtuve ${r.status} ${r.payload?.error || ''}`);
  const fact = r.payload.operation;
  if (fact.type !== 'FACTURA' || fact.afipEstado !== 'AUTORIZADO' || fact.cae !== '65626266267400' || fact.number !== 50000201) throw new Error('La factura del pedido no quedó AUTORIZADA con CAE.');
  const saleF = db.prepare('SELECT * FROM ventas_pos WHERE id=?').get(pedido.saleId);
  if (saleF.tipo !== 'FACTURA' || saleF.estado !== 'CONFIRMADA' || saleF.numero !== 50000201) throw new Error('La operación no se reconvirtió a FACTURA CONFIRMADA.');
  const docF = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(fact.documentId);
  if (docF.estado !== 'CONFIRMADO' || docF.cae !== '65626266267400') throw new Error('El documento de la factura no quedó CONFIRMADO con CAE.');
  const docOld = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(doc1.id);
  if (docOld.estado !== 'ANULADO') throw new Error('El BORRADOR del pedido debe quedar ANULADO al facturar.');
  if (stock() !== 99) throw new Error('Al facturar el pedido debe descontarse stock (quedaron 99).');
  if (cajaMovs() !== 1) throw new Error('Al facturar debe registrarse el cobro en caja.');
  const pay = db.prepare('SELECT * FROM venta_pos_pagos WHERE venta_id=?').get(pedido.saleId);
  if (!pay || pay.medio !== 'EFECTIVO' || Number(pay.importe) !== 1210) throw new Error('El cobro registrado debe ser EFECTIVO por 1210.');
  const mov = db.prepare("SELECT * FROM caja_movimientos WHERE tipo='VENTA'").get();
  if (!mov || Number(mov.importe) !== 1210) throw new Error('El movimiento de caja debe sumar 1210.');

r = await run(erp.facturarPedido, req({}, { id: pedido.saleId }));
  if (r.status !== 400) throw new Error('Una venta ya facturada no debe admitir otra facturación.');

  r = await run(erp.createPosOperation, req(pedidoPayload));
  if (r.status !== 201) throw new Error(`Segundo pedido: esperaba 201, obtuve ${r.status}`);
  const pedido2 = r.payload.operation;
  r = await run(erp.anularOperacion, req({}, { id: pedido2.saleId }));
  if (r.status !== 200 || r.payload.operation.estado !== 'ANULADO') throw new Error('La anulación no devolvió ANULADO.');
  const sale2 = db.prepare('SELECT * FROM ventas_pos WHERE id=?').get(pedido2.saleId);
  if (sale2.estado !== 'ANULADO') throw new Error('El pedido anulado debe quedar en estado ANULADO.');
  const doc2 = db.prepare('SELECT * FROM documentos_comerciales WHERE id=?').get(sale2.documento_id);
  if (doc2.estado !== 'ANULADO') throw new Error('El BORRADOR del pedido anulado debe quedar ANULADO.');
  if (stock() !== 99) throw new Error('Anular un pedido no debe tocar stock.');
  r = await run(erp.anularOperacion, req({}, { id: pedido2.saleId }));
  if (r.status !== 409) throw new Error('Un pedido ya anulado no debe admitir otra anulación.');

  console.log('OK Beta 4: pedido sin stock/caja, facturación con CAE + stock + caja + cobro, y anulación de pedidos.');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
})().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
