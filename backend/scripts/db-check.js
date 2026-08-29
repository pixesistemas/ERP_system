require('dotenv').config();
const db = require('../src/db/database');

const required = [
  'usuarios', 'roles', 'permisos', 'clientes', 'productos',
  'documentos_comerciales', 'documento_items', 'workspaces', 'conversations',
  'recibos', 'recibo_detalles', 'cliente_cc_movimientos', 'depositos',
  'stock_productos', 'stock_movimientos', 'vendedores', 'proveedores',
  'monedas', 'rubros_gasto', 'condiciones_pago', 'sucursales', 'cajeros',
  'bancos', 'cheques', 'cheque_depositos', 'banco_movimientos',
  'ordenes_pago', 'orden_pago_cheques', 'caja_sesiones', 'caja_movimientos',
  'promociones_regalo', 'descuentos_cantidad', 'combos',
  'comprobante_plantillas', 'puntos_venta', 'pos_borradores',
  'reservas_monto', 'reserva_monto_consumos'
];

const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
);
const missing = required.filter(table => !tables.has(table));

console.log(`Tablas: ${tables.size}`);
if (missing.length) {
  console.error('Faltan:', missing.join(', '));
  process.exit(1);
}
const consumptionColumns = new Set(
  db.prepare('PRAGMA table_info(reserva_monto_consumos)').all().map(row => row.name)
);
const missingConsumptionColumns = ['venta_id', 'punto_venta', 'numero_remito']
  .filter(column => !consumptionColumns.has(column));
if (missingConsumptionColumns.length) {
  console.error('Faltan columnas de remito:', missingConsumptionColumns.join(', '));
  process.exit(1);
}
console.log('Base completa Beta 2.2.');
