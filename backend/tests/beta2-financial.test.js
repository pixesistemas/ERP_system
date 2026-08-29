const fs = require('fs');
const path = require('path');
const testDb = path.join(__dirname, '../data/beta2-test.db');
process.env.DB_PATH = testDb;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
const bootstrap = require('../src/db/bootstrap');
bootstrap();
const db = require('../src/db/database');
const erp = require('../src/controllers/erpConsolidation.controller');
const beta2 = require('../src/controllers/beta2.controller');

const empresa = db.prepare("SELECT id FROM empresas WHERE nombre='empresa1'").get();
const branch = db.prepare('SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const cashier = db.prepare('SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const supplier = db.prepare('SELECT id FROM proveedores WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
const bank =
  db.prepare('SELECT id FROM bancos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id) ||
  { id: db.prepare("INSERT INTO bancos(empresa_id,nombre,activo) VALUES(?,'Banco Test',1)").run(empresa.id).lastInsertRowid };

const req = (body = {}, params = {}, query = {}) => ({ body, params, query, empresa: { id: empresa.id }, user: { id: 1, empresaId: empresa.id } });

function run(fn, r) {
  let status = 200;
  let payload;
  const res = {
    status(v) { status = v; return this; },
    json(v) { payload = v; return v; },
  };
  fn(r, res);
  if (status >= 400) throw new Error(payload?.error || `HTTP ${status}`);
  return payload;
}

function print(fn, r) {
  return new Promise((resolve) => {
    fn(r, {
      type() { return this; },
      status() { return this; },
      send(value) { resolve(value); },
    });
  });
}

(async () => {
  const client = db.prepare('SELECT * FROM clientes WHERE empresa_id=? AND (cuit IS NOT NULL OR dni IS NOT NULL) ORDER BY id LIMIT 1').get(empresa.id);
  const product = db.prepare('SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
  db.prepare("UPDATE puntos_venta SET formato_impresion='80MM' WHERE empresa_id=? AND numero=1").run(empresa.id);

  const creditSale = run(erp.createPosOperation, req({
    mode: 'NORMAL', document_kind: 'NOTA_X', cliente_id: client.id, cliente_nombre: client.razon_social,
    sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CUENTA_CORRIENTE',
    total: 1210, items: [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: 1000, iva: 21 }],
  })).operation;
  if (creditSale.condition !== 'CUENTA_CORRIENTE' || creditSale.printFormat !== '80MM') throw new Error('Cuenta corriente o formato por punto de venta incorrecto.');
  if (db.prepare('SELECT COUNT(*) n FROM venta_pos_pagos WHERE venta_id=?').get(creditSale.saleId).n !== 0) throw new Error('Una cuenta corriente no debe registrar medios de cobro.');
  if (db.prepare('SELECT debe FROM cliente_cc_movimientos WHERE documento_id=?').get(creditSale.documentId)?.debe !== 1210) throw new Error('No se debitó el importe completo en la cuenta corriente.');

  run(beta2.saveDrafts, req({ draft: { tabs: [{ id: 1, label: 'Venta 1', cart: [{ id: product.id, cantidad: 2 }] }], activeTab: 1 } }));
  const draft = run(beta2.getDrafts, req()).draft;
  if (draft?.tabs?.[0]?.cart?.[0]?.cantidad !== 2) throw new Error('Los borradores del POS no persistieron por usuario.');

  const frozenPrice = Number(product.precio);
  const reserve = run(erp.createReserveFund, req({ cliente_id: client.id, importe_original: 50000, fecha: '2026-07-31', lista_precio_nombre: 'GENERAL' })).reservation;
  db.prepare('UPDATE productos SET precio=? WHERE id=?').run(frozenPrice + 5000, product.id);
  const deposito = db.prepare('SELECT id FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
  db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo) VALUES(?,?,?,?,0)').run(empresa.id, deposito.id, product.id, 100);
  db.prepare('UPDATE stock_productos SET cantidad=100 WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(empresa.id, deposito.id, product.id);
  const remit = run(erp.createPosOperation, req({
    mode: 'NORMAL', cliente_id: client.id, cliente_nombre: client.razon_social,
    sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CONTADO',
    reserva_monto_id: reserve.id, total: 1,
    items: [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: 1, iva: 21 }],
  })).operation;
  if (remit.type !== 'REMITO' || remit.condition !== 'RESERVA_MONTO') throw new Error('La reserva por monto no generó un remito.');
  const remitItem = db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=?').get(remit.saleId);
  if (Number(remitItem.precio_unitario) !== frozenPrice) throw new Error('El remito no respetó el precio congelado de la reserva.');
  if (db.prepare('SELECT COUNT(*) n FROM venta_pos_pagos WHERE venta_id=?').get(remit.saleId).n !== 0) throw new Error('El retiro por remito no debe registrar medios de cobro.');
  if (db.prepare('SELECT COUNT(*) n FROM caja_movimientos WHERE venta_id=?').get(remit.saleId).n !== 0) throw new Error('El retiro por remito no debe mover caja.');
  if (db.prepare('SELECT saldo FROM reservas_monto WHERE id=?').get(reserve.id).saldo !== 50000 - frozenPrice) throw new Error('No se descontó correctamente el saldo reservado.');
  if (db.prepare("SELECT COUNT(*) n FROM stock_movimientos WHERE documento_id=? AND tipo='SALIDA_REMITO_RESERVA'").get(remit.saleId).n !== 1) throw new Error('No se registró la salida de stock del remito.');
  const remitHtml = await print(beta2.printPosOperation, req({}, { id: remit.saleId }));
  if (!remitHtml.includes('Valor declarado') || remitHtml.includes('<th>Precio</th>')) throw new Error('La impresión del remito no respeta la regla sin precios.');

  run(beta2.openCash, req({ sucursal_id: branch.id, cajero_id: cashier.id, importe_apertura: 10000 }));
  const session = db.prepare("SELECT * FROM caja_sesiones WHERE empresa_id=? AND estado='ABIERTA'").get(empresa.id);
  if (!session || session.saldo_teorico !== 10000) throw new Error('No se abrió correctamente la caja.');

  const first = run(erp.createCheck, req({ numero: 'TEST-DEP', banco_origen: 'Banco origen', librador: 'Cliente', importe: 1500, estado: 'EN_CARTERA' })).check;
  const deposit = run(erp.depositChecks, req({ banco_id: bank.id, cheque_ids: [first.id], fecha: '2026-07-31' })).deposit;
  if (db.prepare('SELECT estado FROM cheques WHERE id=?').get(first.id).estado !== 'DEPOSITADO') throw new Error('El depósito no actualizó el cheque.');
  run(beta2.reconcileDeposit, req({}, { id: deposit.id }));
  if (db.prepare('SELECT estado FROM cheques WHERE id=?').get(first.id).estado !== 'COBRADO') throw new Error('La conciliación no cobró el cheque.');

  const a = run(erp.createCheck, req({ numero: 'TEST-OP-1', banco_origen: 'Banco A', librador: 'Cliente', importe: 2000, estado: 'EN_CARTERA' })).check;
  const b = run(erp.createCheck, req({ numero: 'TEST-OP-2', banco_origen: 'Banco B', librador: 'Cliente', importe: 3000, estado: 'EN_CARTERA' })).check;
  const order = run(beta2.createPaymentOrder, req({ proveedorId: supplier.id, concepto: 'Pago de prueba', efectivo: 500, transferencia: 1000, chequeIds: [a.id, b.id] })).order;
  if (order.total !== 6500 || order.chequeIds.length !== 2) throw new Error('La orden no totalizó múltiples cheques.');
  if (db.prepare("SELECT COUNT(*) n FROM cheques WHERE id IN (?,?) AND estado='ENTREGADO'").get(a.id, b.id).n !== 2) throw new Error('Los cheques no quedaron entregados.');

  run(beta2.closeCash, req({ importe_contado: 9500, arqueo: { EFECTIVO: 9500 } }, { id: session.id }));
  const closed = db.prepare('SELECT * FROM caja_sesiones WHERE id=?').get(session.id);
  if (closed.estado !== 'CERRADA' || closed.importe_contado !== 9500) throw new Error('El cierre no guardó el arqueo.');

  console.log('OK Beta 2.2: cuenta corriente, borradores, remito de reserva, stock, caja, cheques, depósito, conciliación y orden de pago múltiple.');
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDb + suffix, { force: true });
})().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
