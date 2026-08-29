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
const req = (body = {}, params = {}, query = {}) => ({ body, params, query, empresa: { id: empresa.id }, user: { id: 1, empresaId: empresa.id } });
const run = (fn, r) => { let status = 200, payload; const res = { status(v) { status = v; return this; }, json(v) { payload = v; return v; } }; fn(r, res); if (status >= 400) throw new Error(payload?.error || `HTTP ${status}`); return payload; };
const client = db.prepare('SELECT * FROM clientes WHERE empresa_id=? AND (cuit IS NOT NULL OR dni IS NOT NULL) ORDER BY id LIMIT 1').get(empresa.id);
const product = db.prepare('SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare("UPDATE puntos_venta SET formato_impresion='80MM' WHERE empresa_id=? AND numero=1").run(empresa.id);
const frozenPrice = Number(product.precio);
const reserve = run(erp.createReserveFund, req({ cliente_id: client.id, importe_original: 50000, fecha: '2026-07-31', lista_precio_nombre: 'GENERAL' })).reservation;
const deposito = db.prepare('SELECT id FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1').get(empresa.id);
db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo) VALUES(?,?,?,?,0)').run(empresa.id, deposito.id, product.id, 100);
const remit = run(erp.createPosOperation, req({
  mode: 'NORMAL', cliente_id: client.id, cliente_nombre: client.razon_social,
  sucursal_id: branch.id, cajero_id: cashier.id, punto_venta: 1, condicion_pago: 'CONTADO',
  reserva_monto_id: reserve.id, total: 1,
  items: [{ producto_id: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1, precio_unitario: 1, iva: 21 }]
})).operation;
console.log('type:', remit.type, 'saleId:', remit.saleId);
const saleRow = db.prepare('SELECT tipo, numero, punto_venta, condicion_pago, total FROM ventas_pos WHERE id=?').get(remit.saleId);
console.log('venta_pos row:', JSON.stringify(saleRow));
let status = 200;
let remitHtml = '';
const res = {
  type() { return this; },
  status(v) { status = v; return this; },
  send(value) { remitHtml = value; return value; }
};
beta2.printPosOperation(req({}, { id: remit.saleId }), res);
setTimeout(() => {
  console.log('HTTP status:', status);
  console.log('HTML length:', remitHtml.length);
  console.log('contains Valor declarado:', remitHtml.includes('Valor declarado'));
  console.log('contains <th>Precio</th>:', remitHtml.includes('<th>Precio</th>'));
  fs.writeFileSync(path.join(__dirname, 'remito-print-debug.html'), remitHtml);
  console.log('HTML guardado en scripts/remito-print-debug.html');
  process.exit(0);
}, 800);
