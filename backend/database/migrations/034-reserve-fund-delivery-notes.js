const db = require('../../src/db/database');

const columns = db.prepare('PRAGMA table_info(reserva_monto_consumos)').all().map(row => row.name);

for (const [name, sql] of [
  ['venta_id', 'ALTER TABLE reserva_monto_consumos ADD COLUMN venta_id INTEGER'],
  ['punto_venta', 'ALTER TABLE reserva_monto_consumos ADD COLUMN punto_venta INTEGER'],
  ['numero_remito', 'ALTER TABLE reserva_monto_consumos ADD COLUMN numero_remito INTEGER']
]) {
  if (!columns.includes(name)) db.exec(sql);
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_reserva_consumos_remito
  ON reserva_monto_consumos(reserva_id, punto_venta, numero_remito);
`);

console.log('034 retiro de reservas por monto mediante remito aplicado');
